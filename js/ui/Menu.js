// Menu.js - Game menu management
class Menu {
    constructor() {
        this.pauseMenu = document.getElementById('pauseMenu');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.isPaused = false;
        this.soundEnabled = true;
        
        this.initializeEventListeners();
    }
    
    initializeEventListeners() {
        // Pause button
        if (this.pauseBtn) {
            this.pauseBtn.addEventListener('click', () => this.togglePause());
        }
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.togglePause();
            }
        });
    }
    
    togglePause() {
        this.isPaused = !this.isPaused;
        
        if (this.pauseMenu) {
            this.pauseMenu.style.display = this.isPaused ? 'flex' : 'none';
        }
        
        if (window.game) {
            window.game.isPaused = this.isPaused;
            
            // Release pointer lock when paused
            if (this.isPaused && document.pointerLockElement) {
                document.exitPointerLock();
            }
        }
        
        console.log(this.isPaused ? 'Game paused' : 'Game resumed');
    }
    
    resumeGame() {
        if (this.isPaused) {
            this.togglePause();
        }
    }
    
    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        
        // Update button text
        const soundBtns = document.querySelectorAll('.menu-btn');
        soundBtns.forEach(btn => {
            if (btn.textContent.includes('Sonido')) {
                btn.textContent = `Sonido: ${this.soundEnabled ? 'ON' : 'OFF'}`;
            }
        });
        
        // TODO: Implement actual sound toggling when audio system is added
        console.log(`Sound ${this.soundEnabled ? 'enabled' : 'disabled'}`);
    }
    
    resetWorld() {
        if (confirm('¿Estás seguro de que quieres generar un nuevo mundo? Se perderá todo el progreso actual.')) {
            // Clear saved data
            if (window.blockPersistence) {
                window.blockPersistence.clearAllData();
            }
            
            // Reload the page to generate new world
            location.reload();
        }
    }
    
    showLoadingScreen(show = true) {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.style.display = show ? 'flex' : 'none';
        }
    }
    
    updateLoadingProgress(progress) {
        const loadingProgress = document.getElementById('loadingProgress');
        if (loadingProgress) {
            loadingProgress.textContent = `${Math.round(progress)}%`;
        }
    }
}

// Global functions for HTML onclick handlers
window.resumeGame = function() {
    if (window.menu) {
        window.menu.resumeGame();
    }
};

window.toggleSound = function() {
    if (window.menu) {
        window.menu.toggleSound();
    }
};

window.resetWorld = function() {
    if (window.menu) {
        window.menu.resetWorld();
    }
};

// Export for use
window.Menu = Menu;