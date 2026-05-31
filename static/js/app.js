// ==========================================
// VARIABLES GLOBALES
// ==========================================
// Carga las apuestas reales del servidor si existen en la ventana, si no, inicia vacio
let apuestasActivas = window.userBetsFromServer || [];

// CORRECCIÓN CENTRAL: Reutilizamos 'urlParams' del index sin el prefijo "const" para no romper la consola
const currentUsername =
    new URLSearchParams(window.location.search).get('user') || "Invitado";
// ==========================================
// Gestión Segura del Botón Salir
// ==========================================
const btnLogoutCustom = document.getElementById('btn-logout-custom');
if (btnLogoutCustom) {
    btnLogoutCustom.addEventListener('click', () => {
        localStorage.removeItem('pwa_username');
        window.location.href = '/?user=Invitado';
    });
}

// ==========================================
// Logica para capturar el evento de instalacion (PWA)
// ==========================================
let deferredPrompt = null;
const downloadContainer = document.getElementById('download-container');
const btnDownload = document.getElementById('btn-download');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    if (downloadContainer) {
        downloadContainer.style.display = 'flex'; 
        console.log('PWA lista! Mostrando el banner de descarga.');
    }
});

if (btnDownload) {
    btnDownload.addEventListener('click', async () => {
        if (!deferredPrompt) {
            alert("¡Tu PWA está lista! Puedes instalarla directamente desde el botón de la barra de direcciones de tu navegador.");
            return;
        }
        
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`El usuario respondio a la instalacion: ${outcome}`);
        deferredPrompt = null;
        
        if (downloadContainer) {
            downloadContainer.style.display = 'none';
        }
    });
}

// ==========================================
// Logica para la pantalla de bienvenida (Landing)
// ==========================================
const welcomeScreen = document.getElementById('welcome-screen');
const btnEnterApp = document.getElementById('btn-enter-app');
const welcomeInput = document.getElementById('welcome-username');

if (btnEnterApp && welcomeScreen) {
    btnEnterApp.addEventListener('click', () => {
        const usernameValue = welcomeInput.value.trim();
        
        if (usernameValue === "") {
            alert("Por favor, ingresa un nombre de apostador para continuar!");
            return;
        }

        window.fixedUsername = usernameValue;
        localStorage.setItem('pwa_username', usernameValue);
        
        const userDisplay = document.getElementById('current-user-display');
        if (userDisplay) {
            userDisplay.innerText = usernameValue;
        }

        welcomeScreen.style.display = 'none';
        window.location.href = `/?user=${usernameValue}`;
    });
}

// ==========================================
// Elementos y Gestión del Modal de Apuestas
// ==========================================
const betModal = document.getElementById('bet-modal');
const closeModal = document.getElementById('close-modal');
const modalMatchTeams = document.getElementById('modal-match-teams');
const modalBetPick = document.getElementById('modal-bet-pick');
const modalBetOdd = document.getElementById('modal-bet-odd');
const betAmountInput = document.getElementById('bet-amount');
const predictedPayout = document.getElementById('predicted-payout');
const btnPlaceBet = document.getElementById('btn-place-bet');

let currentMatchId = null;
let currentPick = null;
let currentOdd = 0;

document.querySelectorAll('.odd-btn').forEach(button => {
    button.addEventListener('click', function() {
        const matchCard = this.closest('.match-card');
        currentMatchId = matchCard.getAttribute('data-match-id');
        currentPick = this.getAttribute('data-pick');
        currentOdd = parseFloat(this.querySelector('.value').innerText);
        
        const homeName = matchCard.querySelector('.match-teams-header .team-info:nth-child(1) .team-name').innerText;
        const awayName = matchCard.querySelector('.match-teams-header .team-info:nth-child(3) .team-name').innerText;
        
        let pickText = "Local";
        if (currentPick === "DRAW") pickText = "Empate";
        if (currentPick === "AWAY") pickText = "Visita";

        modalMatchTeams.innerText = `${homeName} vs ${awayName}`;
        modalBetPick.innerText = `Prediccion: ${pickText}`;
        modalBetOdd.innerText = currentOdd.toFixed(2);
        betAmountInput.value = ""; 
        predictedPayout.innerText = "$0.00";

        betModal.style.display = 'flex';
    });
});

if (betAmountInput) {
    betAmountInput.addEventListener('input', function() {
        const amount = parseFloat(this.value) || 0;
        const payout = amount * currentOdd;
        predictedPayout.innerText = `$${payout.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    });
}

if (closeModal) {
    closeModal.addEventListener('click', () => {
        betModal.style.display = 'none';
    });
}

if (btnPlaceBet) {
    btnPlaceBet.addEventListener('click', async () => {
        const amount = parseFloat(betAmountInput.value) || 0;
        
        if (amount <= 0) {
            alert("Por favor, ingresa un monto valido mayor a 0.");
            return;
        }
        
        const betData = {
            match_id: parseInt(currentMatchId),
            pick: currentPick,
            amount: amount,
            username: currentUsername  
        };

        try {
            const response = await fetch('/place-bet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(betData)
            });

            const result = await response.json();

            if (response.ok && result.status === "success") {
                const userBalanceElement = document.getElementById('user-balance');
                if (userBalanceElement) {
                    userBalanceElement.innerText = `$${result.new_balance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                }

                let textoJugada = "Local";
                if (currentPick === "DRAW") textoJugada = "Empate";
                if (currentPick === "AWAY") textoJugada = "Visita";

                const nuevaApuesta = {
                    teams: document.getElementById('modal-match-teams').textContent,
                    pick: textoJugada,
                    odd: currentOdd.toFixed(2),
                    amount: amount.toFixed(2),
                    payout: document.getElementById('predicted-payout').textContent,
                    status: "PENDIENTE" 
                };
                
                apuestasActivas.push(nuevaApuesta);
                actualizarPanelLateral();
                
                document.getElementById('bet-amount').value = '';
                if (betModal) {
                    betModal.style.display = 'none';
                }

            } else {
                alert(`Advertencia: No se pudo registrar. ${result.message}`);
            }
        } catch (error) {
            console.error("Error al enviar apuesta:", error);
            alert("Error: Hubo un problema de conexion con el servidor.");
        }
    });
}

// ==========================================
// CONTROLES PARA EL MENU LATERAL (SIDEBAR)
// ==========================================
const sidebarBets = document.getElementById('sidebar-bets');
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const btnCloseSidebar = document.getElementById('btn-close-sidebar');

if (btnToggleSidebar && sidebarBets) {
    btnToggleSidebar.addEventListener('click', () => {
        sidebarBets.style.left = '0px';
    });
}

if (btnCloseSidebar && sidebarBets) {
    btnCloseSidebar.addEventListener('click', () => {
        sidebarBets.style.left = '-320px';
    });
}

// ==========================================
// RENDER DINAMICO DE BOLETOS EN EL SIDEBAR
// ==========================================
function actualizarPanelLateral() {
    const container = document.getElementById('active-bets-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (apuestasActivas.length === 0) {
        container.innerHTML = `<p style="color: #a0a0aa; text-align: center; font-size: 0.9rem; margin-top: 20px;">No tienes apuestas activas todavia.</p>`;
        return;
    }
    
    apuestasActivas.slice().reverse().forEach(apuesta => {
        const estadoActual = (apuesta.status || 'PENDIENTE').toUpperCase();
        
        let badgeTexto = "⏳ Pendiente";
        let colorEstado = "#00ff88";
        let bgEstado = "rgba(0, 255, 136, 0.1)";
        let borderCard = "#00ff88";

        if (estadoActual === "GANADA" || estadoActual === "WON" || estadoActual === "SUCCESS") {
            badgeTexto = "✅ Ganada";
            colorEstado = "#00ff88";
            bgEstado = "rgba(0, 255, 136, 0.1)";
            borderCard = "#00ff88";
        } else if (estadoActual === "PERDIDA" || estadoActual === "LOST" || estadoActual === "FAILED") {
            badgeTexto = "❌ Perdida";
            colorEstado = "#ff4a4a";
            bgEstado = "rgba(255, 74, 74, 0.1)";
            borderCard = "#ff4a4a";
        }

        const tarjetaHTML = `
            <div class="bet-card" style="background: #1e1e24; border-left: 4px solid ${borderCard}; padding: 12px; border-radius: 8px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.2); margin-bottom: 5px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <span style="color: #ffffff; font-weight: bold; font-size: 0.95rem; max-width: 70%; text-align: left;">${apuesta.teams}</span>
                    <span style="color: ${colorEstado}; font-size: 0.85rem; font-weight: bold; background: ${bgEstado}; padding: 2px 6px; border-radius: 4px; white-space: nowrap;">${badgeTexto}</span>
                </div>
                <div style="color: #a0a0aa; font-size: 0.85rem; text-align: left;">
                    Jugada: <strong style="color: #ffffff;">${apuesta.pick}</strong> (${apuesta.odd})
                </div>
                <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
                    <span style="color: #a0a0aa;">Monto: <strong>$${apuesta.amount}</strong></span>
                    <span style="color: #00ff88; font-weight: bold;">Ganas: ${apuesta.payout}</span>
                </div>
            </div>
        `;
        container.innerHTML += tarjetaHTML;
    });
}

actualizarPanelLateral();

// ========================================================
// Logica para Recargar Dinero (+ Recargar)
// ========================================================
const btnDeposit = document.getElementById('btn-deposit');

if (btnDeposit) {
    btnDeposit.addEventListener('click', async () => {
        const amountStr = prompt("¿Cuanto dinero deseas recargar a tu cuenta?", "500");
        if (amountStr === null) return;
        
        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) {
            alert("Por favor, ingresa un monto valido y mayor a 0.");
            return;
        }

        try {
            const response = await fetch('/deposit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: currentUsername, amount: amount })
            });

            const data = await response.json();

            if (response.ok) {
                alert("✅ ¡Recarga exitosa! Se han agregado $" + amount.toFixed(2) + " a tu cuenta.");
                const balanceSpan = document.getElementById('user-balance');
                if (balanceSpan) {
                    balanceSpan.textContent = `$${data.new_balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                }
            } else {
                alert(`Error: ${data.detail || 'No se pudo procesar la recarga'}`);
            }
        } catch (error) {
            console.error("Error en la recarga:", error);
            alert("Error: Hubo un problema de conexion con el servidor.");
        }
    });
}

// ========================================================
// Logica para Simular la Jornada Completa
// ========================================================
const btnSimularTodo = document.getElementById('btn-simular-todo');

if (btnSimularTodo) {
    btnSimularTodo.addEventListener('click', async () => {
        if (!confirm("¿Estas listo para simular todos los partidos de la jornada? Esto resolvera tus apuestas activas.")) return;

        try {
            const response = await fetch('/simular-jornada', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const data = await response.json();

            if (response.ok && data.status === "success") {
                let resumen = "RESUMEN DE LA JORNADA:\n\n";
                data.resultados.forEach(res => {
                    resumen += `- ${res.partido} -> Ganador: ${res.resultado}\n`;
                });
                resumen += "\n¡Los saldos y boletos han sido actualizados!";
                
                alert(resumen);
                window.location.reload();
            } else {
                alert(`No se pudo simular: ${data.message || 'Error desconocido'}`);
            }
        } catch (error) {
            console.error("Error al simular jornada:", error);
            alert("Error: Hubo un problema al conectar con el simulador.");
        }
    });
}

// ========================================================
// Logica para Reiniciar la Jornada
// ========================================================
const btnReiniciarTodo = document.getElementById('btn-reiniciar-todo');

if (btnReiniciarTodo) {
    btnReiniciarTodo.addEventListener('click', async () => {
        if (!confirm("¿Quieres reiniciar todos los partidos a pendientes para seguir apostando?")) return;

        try {
            const response = await fetch('/reiniciar-jornada', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const data = await response.json();

            if (response.ok && data.status === "success") {
                alert("¡Partidos restablecidos! Listos para nuevas apuestas.");
                window.location.reload();
            } else {
                alert("No se pudo reiniciar la jornada.");
            }
        } catch (error) {
            console.error("Error al reiniciar:", error);
            alert("Error de conexion.");
        }
    });
}