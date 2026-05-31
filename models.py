from typing import List, Optional
from sqlmodel import SQLModel, Field, Relationship

# 1. Tabla de Usuarios
class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str
    balance: float
    
    # Relación bidireccional con las apuestas
    bets: List["Bet"] = Relationship(back_populates="user")

# 2. Tabla de Partidos
class Match(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    team_home: str
    team_away: str
    flag_home: str = Field(default="https://cdn-icons-png.flaticon.com/512/814/814587.png")
    flag_away: str = Field(default="https://cdn-icons-png.flaticon.com/512/814/814587.png")
    odds_home: float
    odds_draw: float
    odds_away: float
    status: str = Field(default="PENDING")  # PENDING, FINISHED
    result: Optional[str] = None  # HOME, DRAW, AWAY

    # ¡ESTA LÍNEA FALTABA!: Conecta Match con Bet de forma inversa
    bets: List["Bet"] = Relationship(back_populates="match")

# 3. Tabla de Apuestas
class Bet(SQLModel, table=True):  # <-- Corregido el typo 'cclass'
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    match_id: int = Field(foreign_key="match.id")
    pick: str
    amount: float
    odd: float
    
    # NUEVA COLUMNA: Aquí el backend guardará si la jugada fue "PENDIENTE", "GANADA" o "PERDIDA"
    status: str = Field(default="PENDIENTE")

    # Relaciones inversas limpias para amarrar los datos
    user: Optional[User] = Relationship(back_populates="bets")
    match: Optional[Match] = Relationship(back_populates="bets")