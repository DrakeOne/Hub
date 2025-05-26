class Controls {
    constructor(player) {
        this.player = player;
        this.setupControls();
    }

    setupControls() {
        // === CONTROLES DE TECLADO ===
        document.addEventListener('keydown', (e) => {
            this.player.keys[e.code] = true;
            
            // Cambiar bloque seleccionado
            if (e.code >= 'Digit1' && e.code <= 'Digit5') {
                this.player.selectedBlock = parseInt(e.code.replace('Digit', ''));
                this.player.updateInventoryUI();
            }
            
            // Correr o descender en vuelo
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                if (!this.player.isFlying) {
                    this.player.isRunning = true;
                }
            }
            
            // Manejar espacio para doble tap
            if (e.code === 'Space') {
                e.preventDefault();
                this.player.handleSpacePress();
            }
            
            // Velocidad rápida en vuelo
            if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
                if (this.player.isFlying) {
                    this.player.isFlyingFast = true;
                }
            }
            
            // Prevenir comportamiento por defecto
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }
        });
        
        document.addEventListener('keyup', (e) => {
            this.player.keys[e.code] = false;
            
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                this.player.isRunning = false;
            }
            
            if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
                this.player.isFlyingFast = false;
            }
        });
        
        // === CONTROLES DE MOUSE ===
        const canvas = document.getElementById('gameCanvas');
        
        canvas.addEventListener('click', () => {
            if (!this.player.isMobile && !window.game.isPaused) {
                canvas.requestPointerLock();
            }
        });
        
        document.addEventListener('pointerlockchange', () => {
            this.player.isPointerLocked = document.pointerLockElement === canvas;
        });
        
        document.addEventListener('mousemove', (e) => {
            if (this.player.isPointerLocked) {
                this.player.rotation.y -= e.movementX * this.player.mouseSensitivity;
                this.player.rotation.x -= e.movementY * this.player.mouseSensitivity;
                this.player.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.player.rotation.x));
            }
        });
        
        canvas.addEventListener('mousedown', (e) => {
            if (this.player.isPointerLocked) {
                if (e.button === 0) this.player.breakBlock();
                else if (e.button === 2) this.player.placeBlock();
            }
        });
        
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        canvas.addEventListener('wheel', (e) => {
            if (this.player.isPointerLocked) {
                e.preventDefault();
                const delta = Math.sign(e.deltaY);
                this.player.selectedBlock = ((this.player.selectedBlock - 1 + delta + 5) % 5) + 1;
                this.player.updateInventoryUI();
            }
        });
        
        // === CONTROLES MÓVILES ===
        if (this.player.isMobile) {
            this.setupMobileControls();
        }
    }

    setupMobileControls() {
        const joystickContainer = document.querySelector('.joystick-container');
        const joystick = document.getElementById('joystick');
        let joystickActive = false;
        let joystickTouch = null;
        
        // Joystick
        joystickContainer.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (joystickTouch === null) {
                joystickTouch = e.touches[0].identifier;
                joystickActive = true;
                this.handleJoystickMove(e.touches[0], joystickContainer, joystick);
            }
        });
        
        joystickContainer.addEventListener('touchmove', (e) => {
            e.preventDefault();
            for (let touch of e.touches) {
                if (touch.identifier === joystickTouch) {
                    this.handleJoystickMove(touch, joystickContainer, joystick);
                    break;
                }
            }
        });
        
        const resetJoystick = () => {
            joystickActive = false;
            joystickTouch = null;
            this.player.inputVector.set(0, 0);
            joystick.style.transform = 'translate(-50%, -50%)';
        };
        
        joystickContainer.addEventListener('touchend', (e) => {
            let found = false;
            for (let touch of e.touches) {
                if (touch.identifier === joystickTouch) {
                    found = true;
                    break;
                }
            }
            if (!found) resetJoystick();
        });
        
        joystickContainer.addEventListener('touchcancel', resetJoystick);
        
        // Botones de acción
        let lastJumpTap = 0;
        document.getElementById('jumpBtn').addEventListener('touchstart', (e) => {
            e.preventDefault();
            
            const currentTime = Date.now();
            if (currentTime - lastJumpTap < CONSTANTS.DOUBLE_TAP_TIME) {
                // Doble tap en botón de salto
                this.player.toggleFlying();
                lastJumpTap = 0;
            } else {
                lastJumpTap = currentTime;
                if (!this.player.isFlying) {
                    this.player.jump();
                } else {
                    // En modo vuelo, subir
                    this.player.keys['Space'] = true;
                }
            }
        });
        
        document.getElementById('jumpBtn').addEventListener('touchend', (e) => {
            e.preventDefault();
            this.player.keys['Space'] = false;
        });
        
        document.getElementById('buildBtn').addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.player.placeBlock();
        });
        
        document.getElementById('breakBtn').addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.player.breakBlock();
        });
        
        // Control de cámara táctil
        let cameraTouch = null;
        let lastTouchX = 0;
        let lastTouchY = 0;
        const canvas = document.getElementById('gameCanvas');
        
        canvas.addEventListener('touchstart', (e) => {
            // Encontrar un toque para la cámara (lado derecho de la pantalla)
            for (let touch of e.touches) {
                if (touch.clientX > window.innerWidth * 0.4 && cameraTouch === null) {
                    cameraTouch = touch.identifier;
                    lastTouchX = touch.clientX;
                    lastTouchY = touch.clientY;
                    break;
                }
            }
        });
        
        canvas.addEventListener('touchmove', (e) => {
            for (let touch of e.touches) {
                if (touch.identifier === cameraTouch) {
                    const deltaX = touch.clientX - lastTouchX;
                    const deltaY = touch.clientY - lastTouchY;
                    
                    this.player.rotation.y -= deltaX * this.player.touchSensitivity;
                    this.player.rotation.x -= deltaY * this.player.touchSensitivity;
                    this.player.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.player.rotation.x));
                    
                    lastTouchX = touch.clientX;
                    lastTouchY = touch.clientY;
                    break;
                }
            }
        });
        
        canvas.addEventListener('touchend', (e) => {
            let found = false;
            for (let touch of e.touches) {
                if (touch.identifier === cameraTouch) {
                    found = true;
                    break;
                }
            }
            if (!found) cameraTouch = null;
        });
    }

    handleJoystickMove(touch, container, joystick) {
        const rect = container.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        let x = (touch.clientX - centerX) / (rect.width / 2);
        let y = (touch.clientY - centerY) / (rect.height / 2);
        
        // Limitar al círculo
        const distance = Math.sqrt(x * x + y * y);
        if (distance > 1) {
            x /= distance;
            y /= distance;
        }
        
        this.player.inputVector.set(x, y);
        
        // Actualizar visual
        joystick.style.transform = `translate(${-50 + x * 35}%, ${-50 + y * 35}%)`;
    }
}