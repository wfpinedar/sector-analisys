from typing import List, Dict, Optional, Tuple
import math
import os
import io
import csv
import json

from fastapi import FastAPI, HTTPException, UploadFile, File, Response, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from sqlmodel import SQLModel, Field as SQLField, Relationship, create_engine, Session, select
from sqlalchemy import delete


# ------------------ DB setup ------------------
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./sector.db")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


# ------------------ Models ------------------
class ScaleSet(SQLModel, table=True):
    id: Optional[int] = SQLField(default=None, primary_key=True)
    name: str = SQLField(index=True)
    min_value: float
    max_value: float
    step: float = 1.0
    labels_json: Optional[str] = None  # JSON string { "0":"no influye", ... }

    projects: List["Project"] = Relationship(back_populates="scale_set")


class Project(SQLModel, table=True):
    id: Optional[int] = SQLField(default=None, primary_key=True)
    name: str
    description: Optional[str] = None
    scale_set_id: int = SQLField(foreign_key="scaleset.id")
    scale_set: Optional[ScaleSet] = Relationship(back_populates="projects")
    variables: List["Variable"] = Relationship(back_populates="project")
    cells: List["InfluenceCell"] = Relationship(back_populates="project")


class Variable(SQLModel, table=True):
    id: Optional[int] = SQLField(default=None, primary_key=True)
    project_id: int = SQLField(foreign_key="project.id")
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    project: Optional[Project] = Relationship(back_populates="variables")


class InfluenceCell(SQLModel, table=True):
    id: Optional[int] = SQLField(default=None, primary_key=True)
    project_id: int = SQLField(foreign_key="project.id")
    from_var_id: int = SQLField(foreign_key="variable.id")
    to_var_id: int = SQLField(foreign_key="variable.id")
    value: float = 0.0
    project: Optional[Project] = Relationship(back_populates="cells")


# ------------------ Schemas ------------------
class ScaleSetIn(BaseModel):
    name: str
    min_value: float = 0
    max_value: float = 3
    step: float = 1
    labels: Optional[Dict[str, str]] = None

    @field_validator("max_value")
    @classmethod
    def check_range(cls, v, info):
        minv = info.data.get("min_value", 0)
        if v <= minv:
            raise ValueError("max_value debe ser > min_value")
        return v

    @field_validator("step")
    @classmethod
    def check_step(cls, v):
        if v <= 0:
            raise ValueError("step debe ser > 0")
        return v


class ScaleSetOut(ScaleSetIn):
    id: int


class ProjectIn(BaseModel):
    name: str
    description: Optional[str] = None
    scale_set_id: int


class ProjectOut(ProjectIn):
    id: int


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    scale_set_id: Optional[int] = None


class VariablesIn(BaseModel):
    variables: List[str]


class MatrixIn(BaseModel):
    # matriz NxN en el mismo orden de variables creadas
    matrix: List[List[float]]


class ComputeConfig(BaseModel):
    # mean | median | percentile
    cuts: str = Field(default="mean")
    x_percentile: Optional[float] = None
    y_percentile: Optional[float] = None


class ComputeOut(BaseModel):
    variables: List[str]
    dependencia_x: List[float]
    motricidad_y: List[float]
    x_cut: float
    y_cut: float
    quadrants: Dict[str, str]  # var_name -> cuadrante


# ------------------ Core compute ------------------
def _compute_xy(matrix: List[List[float]]) -> Tuple[List[float], List[float]]:
    n = len(matrix)
    X = [0.0] * n
    Y = [0.0] * n
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            Y[i] += matrix[i][j]
            X[j] += matrix[i][j]
    return X, Y


def _cut(values: List[float], mode: str, p: Optional[float] = None) -> float:
    if mode == "median":
        s = sorted(values)
        n = len(s)
        mid = n // 2
        return s[mid] if n % 2 == 1 else (s[mid - 1] + s[mid]) / 2
    if mode == "percentile":
        if p is None:
            p = 50.0
        s = sorted(values)
        k = (len(s) - 1) * (p / 100.0)
        f, c = math.floor(k), math.ceil(k)
        if f == c:
            return s[int(k)]
        return s[f] + (s[c] - s[f]) * (k - f)
    # default mean
    return sum(values) / len(values) if values else 0.0


def _quadrant(x: float, y: float, x_cut: float, y_cut: float) -> str:
    # nomenclatura clasica MICMAC
    if y >= y_cut and x < x_cut:
        return "Determinante"
    if y >= y_cut and x >= x_cut:
        return "Reguladora"
    if y < y_cut and x >= x_cut:
        return "Resultado"
    return "Autonoma"


# ------------------ FastAPI ------------------
app = FastAPI(title="Sector Analysis API", version="0.1.0")

# CORS: permite que el front (3000) llame al API (8000)
_allowed_env = os.getenv(
    "CORS_ALLOW_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,*",
)
_allowed = [o.strip() for o in _allowed_env.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed if _allowed != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    create_db_and_tables()
    # escala por defecto si no existe
    with Session(engine) as s:
        exists = s.exec(select(ScaleSet).where(ScaleSet.name == "Por defecto 0-3")).first()
        if not exists:
            s.add(ScaleSet(name="Por defecto 0-3", min_value=0, max_value=3, step=1))
            s.commit()


# ------------------ ScaleSets ------------------
@app.post("/scalesets", response_model=ScaleSetOut)
def create_scaleset(payload: ScaleSetIn):
    with Session(engine) as s:
        ss = ScaleSet(
            name=payload.name,
            min_value=payload.min_value,
            max_value=payload.max_value,
            step=payload.step,
            labels_json=None if not payload.labels else json.dumps(payload.labels),
        )
        s.add(ss)
        s.commit()
        s.refresh(ss)
        return ScaleSetOut(id=ss.id, **payload.model_dump())


@app.get("/scalesets", response_model=List[ScaleSetOut])
def list_scalesets():
    with Session(engine) as s:
        rows = s.exec(select(ScaleSet)).all()
        out: List[ScaleSetOut] = []
        for r in rows:
            labels = None
            if r.labels_json:
                try:
                    labels = json.loads(r.labels_json)
                except Exception:
                    labels = None
            out.append(
                ScaleSetOut(
                    id=r.id,
                    name=r.name,
                    min_value=r.min_value,
                    max_value=r.max_value,
                    step=r.step,
                    labels=labels,
                )
            )
        return out


class ScaleSetUpdate(BaseModel):
    name: Optional[str] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    step: Optional[float] = None
    labels: Optional[Dict[str, str]] = None


@app.put("/scalesets/{scaleset_id}", response_model=ScaleSetOut)
def update_scaleset(scaleset_id: int, payload: ScaleSetUpdate):
    with Session(engine) as s:
        ss = s.get(ScaleSet, scaleset_id)
        if not ss:
            raise HTTPException(404, "ScaleSet no existe")

        min_v = payload.min_value if payload.min_value is not None else ss.min_value
        max_v = payload.max_value if payload.max_value is not None else ss.max_value
        if max_v <= min_v:
            raise HTTPException(400, "max_value debe ser > min_value")
        if payload.step is not None and payload.step <= 0:
            raise HTTPException(400, "step debe ser > 0")

        if payload.name is not None:
            ss.name = payload.name
        ss.min_value = min_v
        ss.max_value = max_v
        if payload.step is not None:
            ss.step = payload.step
        if payload.labels is not None:
            ss.labels_json = json.dumps(payload.labels)

        s.add(ss)
        s.commit()
        s.refresh(ss)

        labels = None
        if ss.labels_json:
            try:
                labels = json.loads(ss.labels_json)
            except Exception:
                labels = None
        return ScaleSetOut(
            id=ss.id,
            name=ss.name,
            min_value=ss.min_value,
            max_value=ss.max_value,
            step=ss.step,
            labels=labels,
        )


@app.get("/scalesets/{scaleset_id}", response_model=ScaleSetOut)
def get_scaleset(scaleset_id: int):
    with Session(engine) as s:
        ss = s.get(ScaleSet, scaleset_id)
        if not ss:
            raise HTTPException(404, "ScaleSet no existe")
        labels = None
        if ss.labels_json:
            try:
                labels = json.loads(ss.labels_json)
            except Exception:
                labels = None
        return ScaleSetOut(
            id=ss.id,
            name=ss.name,
            min_value=ss.min_value,
            max_value=ss.max_value,
            step=ss.step,
            labels=labels,
        )


@app.delete("/scalesets/{scaleset_id}")
def delete_scaleset(scaleset_id: int):
    with Session(engine) as s:
        ss = s.get(ScaleSet, scaleset_id)
        if not ss:
            raise HTTPException(404, "ScaleSet no existe")
        proj = s.exec(select(Project).where(Project.scale_set_id == scaleset_id)).first()
        if proj:
            raise HTTPException(400, "No se puede eliminar ScaleSet en uso por proyectos")
        s.delete(ss)
        s.commit()
        return {"ok": True}


# ------------------ Projects ------------------
@app.post("/projects", response_model=ProjectOut)
def create_project(payload: ProjectIn):
    with Session(engine) as s:
        ss = s.get(ScaleSet, payload.scale_set_id)
        if not ss:
            raise HTTPException(404, "ScaleSet no existe")
        pr = Project(
            name=payload.name,
            description=payload.description,
            scale_set_id=payload.scale_set_id,
        )
        s.add(pr)
        s.commit()
        s.refresh(pr)
        return ProjectOut(id=pr.id, **payload.model_dump())


@app.get("/projects", response_model=List[ProjectOut])
def list_projects():
    with Session(engine) as s:
        rows = s.exec(select(Project)).all()
        return [
            ProjectOut(
                id=r.id, name=r.name, description=r.description, scale_set_id=r.scale_set_id
            )
            for r in rows
        ]


@app.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: int):
    with Session(engine) as s:
        pr = s.get(Project, project_id)
        if not pr:
            raise HTTPException(404, "Proyecto no existe")
        return ProjectOut(
            id=pr.id, name=pr.name, description=pr.description, scale_set_id=pr.scale_set_id
        )


@app.put("/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, payload: ProjectUpdate):
    with Session(engine) as s:
        pr = s.get(Project, project_id)
        if not pr:
            raise HTTPException(404, "Proyecto no existe")
        if payload.scale_set_id is not None:
            ss = s.get(ScaleSet, payload.scale_set_id)
            if not ss:
                raise HTTPException(400, "ScaleSet no existe")
            pr.scale_set_id = payload.scale_set_id
        if payload.name is not None:
            pr.name = payload.name
        if payload.description is not None:
            pr.description = payload.description
        s.add(pr)
        s.commit()
        s.refresh(pr)
        return ProjectOut(
            id=pr.id, name=pr.name, description=pr.description, scale_set_id=pr.scale_set_id
        )


@app.delete("/projects/{project_id}")
def delete_project(project_id: int):
    with Session(engine) as s:
        pr = s.get(Project, project_id)
        if not pr:
            raise HTTPException(404, "Proyecto no existe")
        s.exec(delete(InfluenceCell).where(InfluenceCell.project_id == project_id))
        s.exec(delete(Variable).where(Variable.project_id == project_id))
        s.delete(pr)
        s.commit()
        return {"ok": True}


# ------------------ Variables & Matrix ------------------
@app.post("/projects/{project_id}/variables")
def set_variables(project_id: int, payload: VariablesIn):
    """Reemplaza completamente las variables del proyecto.
    Tambien elimina las celdas de matriz existentes (ya no serian consistentes).
    """
    names = [v.strip() for v in (payload.variables or []) if v and v.strip()]
    if not names:
        raise HTTPException(400, "variables vacio")
    with Session(engine) as s:
        pr = s.get(Project, project_id)
        if not pr:
            raise HTTPException(404, "Proyecto no existe")
        # limpiar celdas y variables previas
        s.exec(delete(InfluenceCell).where(InfluenceCell.project_id == project_id))
        s.exec(delete(Variable).where(Variable.project_id == project_id))
        # insertar nuevas variables, en orden
        for name in names:
            s.add(Variable(project_id=project_id, name=name))
        s.commit()
    return {"ok": True, "count": len(names)}


@app.post("/projects/{project_id}/matrix")
def set_matrix(project_id: int, payload: MatrixIn):
    with Session(engine) as s:
        pr = s.get(Project, project_id)
        if not pr:
            raise HTTPException(404, "Proyecto no existe")
        vars = s.exec(select(Variable).where(Variable.project_id == project_id).order_by(Variable.id)).all()
        n = len(vars)
        if n == 0:
            raise HTTPException(400, "Agrega variables antes de la matriz")
        M = payload.matrix
        if len(M) != n or any(len(row) != n for row in M):
            raise HTTPException(400, f"Matriz debe ser {n}x{n}")

        ss = s.get(ScaleSet, pr.scale_set_id)
        for i in range(n):
            for j in range(n):
                if i == j and M[i][j] != 0:
                    raise HTTPException(400, "Diagonal debe ser 0")
                v = M[i][j]
                if v < ss.min_value or v > ss.max_value:
                    raise HTTPException(
                        400, f"Valor fuera de escala [{ss.min_value},{ss.max_value}] en ({i},{j})"
                    )
                if ss.step > 0:
                    k = round((v - ss.min_value) / ss.step, 6)
                    if abs(k - round(k)) > 1e-6:
                        raise HTTPException(400, f"Valor {v} no coincide con step {ss.step}")

        # Limpiar celdas previas y reinsertar (coincidir con nuevas dimensiones)
        s.exec(delete(InfluenceCell).where(InfluenceCell.project_id == project_id))

        id_by_idx = {i: vars[i].id for i in range(n)}
        for i in range(n):
            for j in range(n):
                s.add(
                    InfluenceCell(
                        project_id=project_id,
                        from_var_id=id_by_idx[i],
                        to_var_id=id_by_idx[j],
                        value=M[i][j],
                    )
                )
        s.commit()
    return {"ok": True, "size": n}


@app.get("/projects/{project_id}/matrix")
def get_matrix(project_id: int):
    """Devuelve variables y matriz NxN almacenada (si existe completa)."""
    with Session(engine) as s:
        pr = s.get(Project, project_id)
        if not pr:
            raise HTTPException(404, "Proyecto no existe")
        vars = s.exec(select(Variable).where(Variable.project_id == project_id).order_by(Variable.id)).all()
        n = len(vars)
        names = [v.name for v in vars]
        if n == 0:
            return {"variables": names, "matrix": []}
        rows = s.exec(
            select(InfluenceCell)
            .where(InfluenceCell.project_id == project_id)
            .order_by(InfluenceCell.from_var_id, InfluenceCell.to_var_id)
        ).all()
        if len(rows) != n * n:
            # matriz incompleta
            return {"variables": names, "matrix": None}
        id_to_idx = {vars[i].id: i for i in range(n)}
        M = [[0.0] * n for _ in range(n)]
        for r in rows:
            i = id_to_idx[r.from_var_id]
            j = id_to_idx[r.to_var_id]
            M[i][j] = r.value
        return {"variables": names, "matrix": M}


@app.get("/projects/{project_id}/status")
def project_status(project_id: int):
    """Resumen de persistencia: numero de variables y si hay matriz completa."""
    with Session(engine) as s:
        pr = s.get(Project, project_id)
        if not pr:
            raise HTTPException(404, "Proyecto no existe")
        vars = s.exec(select(Variable).where(Variable.project_id == project_id)).all()
        n = len(vars)
        total_cells = s.exec(select(InfluenceCell).where(InfluenceCell.project_id == project_id)).all()
        matrix_complete = (len(total_cells) == (n * n) and n > 0)
        return {
            "project_id": project_id,
            "variables_count": n,
            "matrix_cells": len(total_cells),
            "matrix_complete": matrix_complete,
        }


@app.post("/projects/{project_id}/compute", response_model=ComputeOut)
def compute(project_id: int, cfg: ComputeConfig = ComputeConfig()):
    with Session(engine) as s:
        pr = s.get(Project, project_id)
        if not pr:
            raise HTTPException(404, "Proyecto no existe")
        vars = s.exec(select(Variable).where(Variable.project_id == project_id).order_by(Variable.id)).all()
        n = len(vars)
        if n == 0:
            raise HTTPException(400, "Proyecto sin variables")
        rows = s.exec(
            select(InfluenceCell)
            .where(InfluenceCell.project_id == project_id)
            .order_by(InfluenceCell.from_var_id, InfluenceCell.to_var_id)
        ).all()
        if len(rows) != n * n:
            raise HTTPException(400, "Matriz no cargada completa")
        M = [[0.0] * n for _ in range(n)]
        id_to_idx = {vars[i].id: i for i in range(n)}
        for r in rows:
            i = id_to_idx[r.from_var_id]
            j = id_to_idx[r.to_var_id]
            M[i][j] = r.value

        X, Y = _compute_xy(M)
        mode = cfg.cuts if cfg.cuts in {"mean", "median", "percentile"} else "mean"
        x_cut = _cut(X, "percentile", cfg.x_percentile) if mode == "percentile" and cfg.x_percentile else _cut(X, mode)
        y_cut = _cut(Y, "percentile", cfg.y_percentile) if mode == "percentile" and cfg.y_percentile else _cut(Y, mode)
        quads: Dict[str, str] = {}
        names = [v.name for v in vars]
        for i, nm in enumerate(names):
            quads[nm] = _quadrant(X[i], Y[i], x_cut, y_cut)
        return ComputeOut(
            variables=names,
            dependencia_x=X,
            motricidad_y=Y,
            x_cut=x_cut,
            y_cut=y_cut,
            quadrants=quads,
        )


# ------------------ EXPORT JSON/CSV ------------------
@app.get("/projects/{project_id}/export")
def export_project_json(project_id: int):
    """Exporta JSON con variables y matriz completa en orden por ID."""
    with Session(engine) as s:
        pr = s.get(Project, project_id)
        if not pr:
            raise HTTPException(404, "Proyecto no existe")
        vars = s.exec(select(Variable).where(Variable.project_id == project_id).order_by(Variable.id)).all()
        if not vars:
            raise HTTPException(400, "Proyecto sin variables")
        n = len(vars)
        rows = s.exec(
            select(InfluenceCell)
            .where(InfluenceCell.project_id == project_id)
            .order_by(InfluenceCell.from_var_id, InfluenceCell.to_var_id)
        ).all()
        if len(rows) != n * n:
            raise HTTPException(400, "Matriz no cargada completa")
        id_to_idx = {vars[i].id: i for i in range(n)}
        M = [[0.0] * n for _ in range(n)]
        for r in rows:
            i = id_to_idx[r.from_var_id]
            j = id_to_idx[r.to_var_id]
            M[i][j] = r.value
        payload = {
            "project": {"id": pr.id, "name": pr.name, "description": pr.description},
            "scale_set_id": pr.scale_set_id,
            "variables": [v.name for v in vars],
            "matrix": M,
        }
        return payload


@app.get("/projects/{project_id}/export/variables.csv")
def export_variables_csv(project_id: int):
    with Session(engine) as s:
        pr = s.get(Project, project_id)
        if not pr:
            raise HTTPException(404, "Proyecto no existe")
        vars = s.exec(select(Variable).where(Variable.project_id == project_id).order_by(Variable.id)).all()
        if not vars:
            raise HTTPException(400, "Proyecto sin variables")
        buf = io.StringIO(newline="")
        writer = csv.writer(buf)
        writer.writerow(["code", "name", "description"])
        for i, v in enumerate(vars, start=1):
            writer.writerow([v.code or f"VAR{i}", v.name, v.description or ""])
        data = buf.getvalue()
        return Response(
            content=data,
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f"attachment; filename=variables_project_{project_id}.csv"
            },
        )


@app.get("/projects/{project_id}/export/matrix.csv")
def export_matrix_csv(project_id: int):
    with Session(engine) as s:
        pr = s.get(Project, project_id)
        if not pr:
            raise HTTPException(404, "Proyecto no existe")
        vars = s.exec(select(Variable).where(Variable.project_id == project_id).order_by(Variable.id)).all()
        if not vars:
            raise HTTPException(400, "Proyecto sin variables")
        n = len(vars)
        rows = s.exec(
            select(InfluenceCell)
            .where(InfluenceCell.project_id == project_id)
            .order_by(InfluenceCell.from_var_id, InfluenceCell.to_var_id)
        ).all()
        if len(rows) != n * n:
            raise HTTPException(400, "Matriz no cargada completa")
        id_to_idx = {vars[i].id: i for i in range(n)}
        M = [[0.0] * n for _ in range(n)]
        for r in rows:
            i = id_to_idx[r.from_var_id]
            j = id_to_idx[r.to_var_id]
            M[i][j] = r.value
        buf = io.StringIO(newline="")
        writer = csv.writer(buf)
        header = [""] + [v.name for v in vars]
        writer.writerow(header)
        for i, v in enumerate(vars):
            writer.writerow([v.name] + M[i])
        data = buf.getvalue()
        return Response(
            content=data,
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f"attachment; filename=matrix_project_{project_id}.csv"
            },
        )


# ------------------ Import CSV ------------------
@app.post("/projects/{project_id}/import/csv")
def import_csv(
    project_id: int,
    variables_file: UploadFile = File(..., description="CSV con columnas code,name,description"),
    matrix_file: UploadFile = File(..., description="CSV NxN con headers"),
    replace: bool = Query(True, description="Si true, reemplaza variables y matriz del proyecto"),
):
    """Importa variables y matriz desde CSV. Reemplaza datos previos si replace=true."""
    try:
        var_bytes = variables_file.file.read()
        mat_bytes = matrix_file.file.read()
    finally:
        variables_file.file.close()
        matrix_file.file.close()

    var_txt = var_bytes.decode("utf-8-sig").strip()
    mat_txt = mat_bytes.decode("utf-8-sig").strip()

    # variables.csv
    var_names: List[str] = []
    var_rows = csv.DictReader(io.StringIO(var_txt))
    if not {"name"}.issubset({c.strip() for c in (var_rows.fieldnames or [])}):
        raise HTTPException(400, "variables.csv debe tener al menos la columna 'name'")
    for row in var_rows:
        name = (row.get("name") or "").strip()
        if name:
            var_names.append(name)
    if not var_names:
        raise HTTPException(400, "variables.csv sin nombres validos")

    # matrix.csv
    mat_reader = csv.reader(io.StringIO(mat_txt))
    rows = list(mat_reader)
    if not rows or len(rows) < 2:
        raise HTTPException(400, "matrix.csv invalido")
    header = rows[0][1:]  # sin la primera celda vacia
    body = rows[1:]

    n = len(var_names)
    if len(header) != n or len(body) != n:
        raise HTTPException(400, f"matrix.csv debe ser {n}x{n} con encabezados que coincidan con variables")
    if header != var_names:
        raise HTTPException(400, "Los encabezados de columnas deben coincidir con variables.csv (mismo orden)")

    M: List[List[float]] = [[0.0] * n for _ in range(n)]
    for i, row in enumerate(body):
        row_name = (row[0] or "").strip()
        if row_name != var_names[i]:
            raise HTTPException(400, f"El encabezado de fila '{row_name}' no coincide con '{var_names[i]}' en la fila {i+2}")
        if len(row[1:]) != n:
            raise HTTPException(400, f"Fila {i+2} con longitud {len(row[1:])}, se esperaba {n}")
        try:
            values = [float(x) for x in row[1:]]
        except ValueError:
            raise HTTPException(400, f"Valores no numericos en fila {i+2}")
        M[i] = values

    with Session(engine) as s:
        pr = s.get(Project, project_id)
        if not pr:
            raise HTTPException(404, "Proyecto no existe")
        ss = s.get(ScaleSet, pr.scale_set_id)

        for i in range(n):
            for j in range(n):
                if i == j and M[i][j] != 0:
                    raise HTTPException(400, "Diagonal debe ser 0")
                v = M[i][j]
                if v < ss.min_value or v > ss.max_value:
                    raise HTTPException(
                        400, f"Valor fuera de escala [{ss.min_value},{ss.max_value}] en ({i},{j})"
                    )
                if ss.step > 0:
                    k = round((v - ss.min_value) / ss.step, 6)
                    if abs(k - round(k)) > 1e-6:
                        raise HTTPException(400, f"Valor {v} no coincide con step {ss.step}")

        if replace:
            s.exec(delete(InfluenceCell).where(InfluenceCell.project_id == project_id))
            s.exec(delete(Variable).where(Variable.project_id == project_id))
            s.commit()

        var_ids: List[int] = []
        for nm in var_names:
            v = Variable(project_id=project_id, name=nm)
            s.add(v)
            s.flush()
            var_ids.append(v.id)

        for i in range(n):
            for j in range(n):
                s.add(
                    InfluenceCell(
                        project_id=project_id,
                        from_var_id=var_ids[i],
                        to_var_id=var_ids[j],
                        value=M[i][j],
                    )
                )
        s.commit()

    return {"ok": True, "variables": n, "size": n}


# ------------------ Heatmap & Graph ------------------
@app.get("/projects/{project_id}/heatmap")
def heatmap(project_id: int):
    """Devuelve variables, escala y matriz completa para heatmap."""
    with Session(engine) as s:
        pr = s.get(Project, project_id)
        if not pr:
            raise HTTPException(404, "Proyecto no existe")
        vars = s.exec(select(Variable).where(Variable.project_id == project_id).order_by(Variable.id)).all()
        if not vars:
            raise HTTPException(400, "Proyecto sin variables")
        n = len(vars)
        rows = s.exec(
            select(InfluenceCell)
            .where(InfluenceCell.project_id == project_id)
            .order_by(InfluenceCell.from_var_id, InfluenceCell.to_var_id)
        ).all()
        if len(rows) != n * n:
            raise HTTPException(400, "Matriz no cargada completa")
        id_to_idx = {vars[i].id: i for i in range(n)}
        M = [[0.0] * n for _ in range(n)]
        for r in rows:
            i = id_to_idx[r.from_var_id]
            j = id_to_idx[r.to_var_id]
            M[i][j] = r.value
        ss = s.get(ScaleSet, pr.scale_set_id)
        return {
            "variables": [v.name for v in vars],
            "scale": {"min": ss.min_value, "max": ss.max_value, "step": ss.step},
            "matrix": M,
        }


@app.get("/projects/{project_id}/graph")
def graph(project_id: int, min_weight: float = Query(0.0, ge=0.0), directed: bool = True):
    """Devuelve nodos y aristas (filtradas por min_weight). Si directed=False, condensa sumando pesos."""
    with Session(engine) as s:
        pr = s.get(Project, project_id)
        if not pr:
            raise HTTPException(404, "Proyecto no existe")
        vars = s.exec(select(Variable).where(Variable.project_id == project_id).order_by(Variable.id)).all()
        if not vars:
            raise HTTPException(400, "Proyecto sin variables")
        n = len(vars)
        rows = s.exec(
            select(InfluenceCell)
            .where(InfluenceCell.project_id == project_id)
            .order_by(InfluenceCell.from_var_id, InfluenceCell.to_var_id)
        ).all()
        if len(rows) != n * n:
            raise HTTPException(400, "Matriz no cargada completa")
        id_to_idx = {vars[i].id: i for i in range(n)}
        M = [[0.0] * n for _ in range(n)]
        for r in rows:
            i = id_to_idx[r.from_var_id]
            j = id_to_idx[r.to_var_id]
            M[i][j] = r.value
        nodes = [{"id": i, "name": vars[i].name} for i in range(n)]
        links = []
        if directed:
            for i in range(n):
                for j in range(n):
                    if i == j:
                        continue
                    w = M[i][j]
                    if w >= min_weight and w > 0:
                        links.append({"source": i, "target": j, "weight": w})
        else:
            for i in range(n):
                for j in range(i + 1, n):
                    w = M[i][j] + M[j][i]
                    if w >= min_weight and w > 0:
                        links.append({"source": i, "target": j, "weight": w})
        return {"nodes": nodes, "links": links}
