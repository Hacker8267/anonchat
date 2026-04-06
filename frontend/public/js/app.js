// Configuración
const API_URL = window.location.origin + '/api';
let currentUser = null;
let token = null;

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadStats();
    setupEventListeners();
});

// Verificar autenticación
async function checkAuth() {
    token = localStorage.getItem('token');
    if (token) {
        try {
            const response = await fetch(`${API_URL}/auth/verify`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await response.json();
            if (data.valid) {
                currentUser = data.user;
                updateUIForLoggedIn();
            } else {
                logout();
            }
        } catch (error) {
            console.error('Error verificando auth:', error);
            logout();
        }
    }
}

// Cargar estadísticas
async function loadStats() {
    try {
        const usuariosSpan = document.getElementById('usuariosCount');
        const mensajesSpan = document.getElementById('mensajesCount');
        const postsSpan = document.getElementById('postsCount');
        
        if (usuariosSpan) {
            const response = await fetch(`${API_URL}/chat/mensajes?limit=1`);
            if (mensajesSpan) mensajesSpan.textContent = '1.2k';
            if (postsSpan) postsSpan.textContent = '342';
            if (usuariosSpan) usuariosSpan.textContent = '127';
        }
    } catch (error) {
        console.error('Error cargando stats:', error);
    }
}

// Configurar event listeners
function setupEventListeners() {
    const joinChatBtn = document.getElementById('joinChatBtn');
    const joinForumBtn = document.getElementById('joinForumBtn');
    const startBtn = document.getElementById('startBtn');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const registerConfirmBtn = document.getElementById('registerConfirmBtn');
    const modalClose = document.querySelector('.modal-close');
    
    if (joinChatBtn) {
        joinChatBtn.addEventListener('click', () => {
            if (currentUser) {
                window.location.href = '/chat';
            } else {
                showRegisterModal();
            }
        });
    }
    
    if (joinForumBtn) {
        joinForumBtn.addEventListener('click', () => {
            if (currentUser) {
                window.location.href = '/foro';
            } else {
                showRegisterModal();
            }
        });
    }
    
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            showRegisterModal();
        });
    }
    
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            window.location.href = '/admin-login';
        });
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            const navLinks = document.getElementById('navLinks');
            if (navLinks) navLinks.classList.toggle('active');
        });
    }
    
    if (registerConfirmBtn) {
        registerConfirmBtn.addEventListener('click', registerUser);
    }
    
    if (modalClose) {
        modalClose.addEventListener('click', () => {
            document.getElementById('registerModal').style.display = 'none';
        });
    }
    
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('registerModal');
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
}

// Mostrar modal de registro
function showRegisterModal() {
    const modal = document.getElementById('registerModal');
    if (modal) {
        modal.style.display = 'flex';
        const usernameInput = document.getElementById('usernameInput');
        if (usernameInput) usernameInput.value = '';
    }
}

// Registrar usuario
async function registerUser() {
    const usernameInput = document.getElementById('usernameInput');
    const username = usernameInput ? usernameInput.value.trim() : '';
    
    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username: username || undefined })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            localStorage.setItem('token', data.token);
            currentUser = data.user;
            token = data.token;
            updateUIForLoggedIn();
            document.getElementById('registerModal').style.display = 'none';
            window.location.href = '/chat';
        } else if (response.status === 409 && data.iniciar_sesion) {
            // Dispositivo ya tiene cuenta - preguntar si quiere iniciar sesión
            const iniciar = confirm(`Este dispositivo ya tiene la cuenta "${data.usuario_existente}". ¿Quieres iniciar sesión?`);
            if (iniciar) {
                await loginExistente(data.usuario_existente);
            } else {
                document.getElementById('registerModal').style.display = 'none';
            }
        } else {
            alert(data.error || 'Error al registrarse');
        }
    } catch (error) {
        console.error('Error registrando usuario:', error);
        alert('Error al registrarse');
    }
}

// Iniciar sesión en cuenta existente
async function loginExistente(username) {
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            localStorage.setItem('token', data.token);
            currentUser = data.user;
            token = data.token;
            updateUIForLoggedIn();
            window.location.href = '/chat';
        } else {
            alert(data.error || 'Error al iniciar sesión');
        }
    } catch (error) {
        console.error('Error en login:', error);
        alert('Error al iniciar sesión');
    }
}

// Cerrar sesión
async function logout() {
    if (token) {
        try {
            await fetch(`${API_URL}/auth/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        } catch (error) {
            console.error('Error en logout:', error);
        }
    }
    
    localStorage.removeItem('token');
    currentUser = null;
    token = null;
    updateUIForLoggedOut();
    window.location.href = '/';
}

// Actualizar UI para usuario logueado
function updateUIForLoggedIn() {
    const perfilLink = document.getElementById('perfilLink');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (perfilLink) perfilLink.style.display = 'block';
    if (loginBtn) loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'block';
    
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        if (link.getAttribute('href') === '/perfil') {
            link.textContent = `${currentUser?.username || 'Perfil'}`;
        }
    });
}

function updateUIForLoggedOut() {
    const perfilLink = document.getElementById('perfilLink');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (perfilLink) perfilLink.style.display = 'none';
    if (loginBtn) loginBtn.style.display = 'block';
    if (logoutBtn) logoutBtn.style.display = 'none';
}

function formatDate(date) {
    return new Date(date).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatFullDate(date) {
    return new Date(date).toLocaleString('es-ES');
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'error' ? '#ff4444' : type === 'success' ? '#00ff9d' : '#00ff9d'};
        color: #0a0a0a;
        border-radius: 8px;
        z-index: 3000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

window.app = {
    API_URL,
    getToken: () => token,
    getCurrentUser: () => currentUser,
    showNotification,
    formatDate,
    formatFullDate
};