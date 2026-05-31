import random
from typing import List, Optional
import json
import os
from fastapi import FastAPI, Request, Depends, HTTPException, status
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlmodel import Session, select
from database import init_db, get_session
from models import User, Match, Bet
from pydantic import BaseModel
from sqlalchemy.orm import selectinload

app = FastAPI(title="Simulador de Apuestas Mundial 2026")

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

@app.get("/service-worker.js")
def get_sw():
    return FileResponse(os.path.join("static", "sw.js"), media_type="application/javascript")

# Modelos de Pydantic
class UsernameUpdate(BaseModel):
    username: str
    
class BetCreate(BaseModel):
    match_id: int
    pick: str  
    amount: float
    username: str  

class DepositRequest(BaseModel):
    username: str
    amount: float

class ResolveMatchRequest(BaseModel):
    match_id: int
    outcome: str  


# 1. Inicialización de datos de prueba
@app.on_event("startup")
def on_startup():
    init_db()
    from database import engine
    with Session(engine) as session:
        if not session.exec(select(User)).first():
            test_user = User(username="Invitado", balance=1000.0)
            session.add(test_user)
            
        if not session.exec(select(Match)).first():
            partidos_reales = [
                Match(
                    team_home="México", team_away="Kuwait",  
                    flag_home="https://flagcdn.com/w320/mx.png", flag_away="https://flagcdn.com/w320/kw.png",
                    odds_home=1.45, odds_draw=4.20, odds_away=6.80, status="PENDING"
                ),
                Match(
                    team_home="Canadá", team_away="Togo",    
                    flag_home="https://flagcdn.com/w320/ca.png", flag_away="https://flagcdn.com/w320/tg.png",
                    odds_home=1.65, odds_draw=3.80, odds_away=5.10, status="PENDING"
                ),
                Match(
                    team_home="Estados Unidos", team_away="San Cristóbal y Nieves", 
                    flag_home="https://flagcdn.com/w320/us.png", flag_away="https://flagcdn.com/w320/kn.png",
                    odds_home=1.15, odds_draw=7.50, odds_away=15.00, status="PENDING"
                ),
                Match(
                    team_home="Argentina", team_away="Francia", 
                    flag_home="https://flagcdn.com/w320/ar.png", flag_away="https://flagcdn.com/w320/fr.png",
                    odds_home=2.40, odds_draw=3.20, odds_away=2.80, status="PENDING"
                )
            ]
            session.add_all(partidos_reales)
        session.commit()


# 2. RUTA PRINCIPAL: Trae TODOS los partidos (Pendientes y Finalizados)
# 2. Ruta Principal: Muestra el tablero con el saldo del usuario y los partidos
@app.get("/", response_class=HTMLResponse)
def read_root(request: Request, user: Optional[str] = None, db: Session = Depends(get_session)):
    try:
        show_landing = False
        if user is None or user.strip() == "" or user == "Invitado":
            show_landing = True
            user = "Invitado"

        # OBLIGAMOS a la base de datos a expirar la memoria caché interna
        # Esto hace exactamente lo que queríamos: leer los datos frescos del archivo .db
        db.expire_all()

        current_user = db.exec(
            select(User).where(User.username == user).options(
                selectinload(User.bets).selectinload(Bet.match)
            )
        ).first()
        
        if not current_user:
            current_user = User(username=user, balance=1000.0)
            db.add(current_user)
            db.commit()
            db.refresh(current_user)
        
        # Ahora sí, trae todos los partidos (tanto PENDING como FINISHED)
        matches = db.exec(select(Match)).all()
        
        user_bets_list = []
        if current_user and current_user.bets:
            for bet in current_user.bets:
                if bet.match:
                    user_bets_list.append({
                        "teams": f"{bet.match.team_home} vs {bet.match.team_away}",
                        "pick": "Local" if bet.pick == "HOME" else "Empate" if bet.pick == "DRAW" else "Visita",
                        "odd": f"{bet.odd:.2f}",
                        "amount": f"{bet.amount:.2f}",
                        "payout": f"${(bet.amount * bet.odd):.2f}",
                        "status": bet.status  # Estado físico real de la base de datos
                    })
                    
        user_bets_json = json.dumps(user_bets_list)
            
        return templates.TemplateResponse(
            request=request,
            name="index.html",
            context={
                "user": current_user,
                "matches": matches,
                "user_bets_json": user_bets_json,
                "show_landing": show_landing  
            }
        )
    except Exception as e:
        print(f"❌ ERROR EN READ_ROOT: {e}")
        return HTMLResponse(content=f"<h2>⚠️ Ocurrió un error en el Servidor:</h2><pre>{str(e)}</pre>", status_code=500)    

# 3. Ruta POST: Actualizar nombre desde la Landing
@app.post("/update-username")
def update_username(data: UsernameUpdate, db: Session = Depends(get_session)):
    try:
        user = db.exec(select(User)).first()
        if user:
            user.username = data.username
            db.add(user)
            db.commit()
            db.refresh(user)
            return {"status": "success", "new_username": user.username}
        return JSONResponse(status_code=404, content={"status": "error", "message": "Usuario no encontrado"})
    except Exception as e:
        print(f"❌ ERROR EN UPDATE_USERNAME: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})


# 4. Ruta POST: Colocar Apuestas
@app.post("/place-bet")
def place_bet(data: BetCreate, db: Session = Depends(get_session)):
    try:
        user = db.exec(select(User).where(User.username == data.username)).first()
        if not user:
            return JSONResponse(status_code=404, content={"status": "error", "message": "Usuario no encontrado"})
            
        if data.amount <= 0:
            return JSONResponse(status_code=400, content={"status": "error", "message": "El monto debe ser mayor a 0"})
            
        if user.balance < data.amount:
            return JSONResponse(status_code=400, content={"status": "error", "message": "Saldo insuficiente. ¡Necesitas recargar!"})
            
        match = db.get(Match, data.match_id)
        if not match or match.status != "PENDING":
            return JSONResponse(status_code=400, content={"status": "error", "message": "El partido no está disponible para apuestas"})

        if data.pick == "HOME":
            chosen_odd = match.odds_home
        elif data.pick == "DRAW":
            chosen_odd = match.odds_draw
        else:
            chosen_odd = match.odds_away

        nueva_apuesta = Bet(
            user_id=user.id,
            match_id=match.id,
            pick=data.pick,
            amount=data.amount,
            odd=chosen_odd,
            status="PENDIENTE"
        )
        
        user.balance -= data.amount
        
        db.add(nueva_apuesta)
        db.add(user)
        db.commit()
        db.refresh(user)
        
        return {
            "status": "success", 
            "message": "¡Apuesta colocada con éxito!", 
            "new_balance": user.balance
        }
        
    except Exception as e:
        print(f"❌ ERROR EN PLACE_BET: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})
    

# 5. Ruta POST: Depósitos
@app.post("/deposit")
def make_deposit(request: DepositRequest, db: Session = Depends(get_session)):
    try:
        username = request.username
        amount = request.amount
        user = db.exec(select(User).where(User.username == username)).first()
        
        if user:
            user.balance += amount
            db.add(user)
            db.commit()      
            db.refresh(user) 
            return {"status": "success", "new_balance": user.balance}
        else:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"❌ ERROR EN MAKE_DEPOSIT: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# 6. SIMULACIÓN ACTUALIZADA: Cambia estados de partidos y de boletos al mismo tiempo
@app.post("/simular-jornada")
def simular_jornada(db: Session = Depends(get_session)):
    try:
        matches = db.exec(select(Match).where(Match.status == "PENDING")).all()
        
        if not matches:
            return JSONResponse(status_code=400, content={"status": "error", "message": "No hay partidos pendientes por simular."})
        
        resultados_simulados = []
        opciones = ["HOME", "DRAW", "AWAY"]
        
        for match in matches:
            outcome = random.choice(opciones)
            match.status = "FINISHED"
            match.result = outcome  # Guardamos el resultado en el partido ("HOME", "DRAW" o "AWAY")
            db.add(match)
            
            texto_resultado = "Local" if outcome == "HOME" else "Empate" if outcome == "DRAW" else "Visita"
            resultados_simulados.append({
                "partido": f"{match.team_home} vs {match.team_away}",
                "resultado": texto_resultado
            })
            
            # Buscamos todas las apuestas hechas para este partido en concreto
            bets = db.exec(select(Bet).where(Bet.match_id == match.id).options(selectinload(Bet.user))).all()
            for bet in bets:
                if bet.pick == outcome:
                    ganancia = bet.amount * bet.odd
                    bet.user.balance += ganancia
                    db.add(bet.user)
                    bet.status = "GANADA"    # Guardamos físicamente en la BD
                else:
                    bet.status = "PERDIDA"   # Guardamos físicamente en la BD
                db.add(bet)
        
        db.commit()
        return {
            "status": "success",
            "message": "¡Jornada simulada con éxito!",
            "resultados": resultados_simulados
        }
    except Exception as e:
        print(f"❌ ERROR EN SIMULAR_JORNADA: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})
    

@app.post("/reiniciar-jornada")
def reiniciar_jornada(db: Session = Depends(get_session)):
    try:
        matches = db.exec(select(Match)).all()
        for match in matches:
            match.status = "PENDING"
            match.result = None  # Limpiamos el resultado viejo
            db.add(match)
        
        bets = db.exec(select(Bet)).all()
        for bet in bets:
            db.delete(bet)
            
        db.commit()
        return {"status": "success", "message": "¡Jornada reiniciada con éxito!"}
    except Exception as e:
        print(f"❌ ERROR EN REINICIAR_JORNADA: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})