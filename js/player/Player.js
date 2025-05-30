class Player {
    constructor() {
        // Posición y física
        this.position = new THREE.Vector3(0, 80, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
        
        // Configuración de movimiento
        this.moveSpeed = CONSTANTS.MOVE_SPEED;
        this.runSpeed = CONSTANTS.RUN_SPEED;
        this.jumpSpeed = CONSTANTS.JUMP_SPEED;
        this.flySpeed = CONSTANTS.FLY_SPEED;
        this.flySpeedFast = CONSTANTS.FLY_SPEED_FAST;
        this.gravity = CONSTANTS.GRAVITY;
        
        // Estados
        this.isGrounded = false;
        this.isRunning = false;
        this.isInWater = false;
        this.isFlying = false;
        this.isFlyingFast = false;
        
        // Propiedades físicas - Dimensiones exactas de Minecraft
        this.height = CONSTANTS.PLAYER_HEIGHT;       // 1.8 metros
        this.eyeHeight = CONSTANTS.PLAYER_EYE_HEIGHT; // 1.62 metros desde la base
        this.radius = CONSTANTS.PLAYER_RADIUS;        // 0.3 metros (0.6m de ancho)
        
        // Controles
        this.inputVector = new THREE.Vector2(0, 0);
        this.keys = {};
        this.isPointerLocked = false;
        
        // Configuración de cámara
        this.mouseSensitivity = CONSTANTS.MOUSE_SENSITIVITY;
        this.touchSensitivity = CONSTANTS.TOUCH_SENSITIVITY;
        
        // Inventario
        this.selectedBlock = 1;
        this.reach = 5;
        
        // Mobile
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        // Control de doble tap para vuelo
        this.lastSpaceTime = 0;
        this.spaceDoubleTapTime = CONSTANTS.DOUBLE_TAP_TIME;
        
        this.controls = new Controls(this);
    }

    update(deltaTime) {
        // Recopilar input - ARREGLADO: Invertir Y para que adelante sea adelante
        if (!this.isMobile) {
            this.inputVector.set(0, 0);
            if (this.keys['KeyW'] || this.keys['ArrowUp']) this.inputVector.y += 1;    // Cambiado de -= a +=
            if (this.keys['KeyS'] || this.keys['ArrowDown']) this.inputVector.y -= 1;  // Cambiado de += a -=
            if (this.keys['KeyA'] || this.keys['ArrowLeft']) this.inputVector.x -= 1;
            if (this.keys['KeyD'] || this.keys['ArrowRight']) this.inputVector.x += 1;
        }
        
        // Normalizar input
        if (this.inputVector.length() > 1) {
            this.inputVector.normalize();
        }
        
        // Calcular dirección de movimiento
        const forward = new THREE.Vector3(0, 0, -1);
        const right = new THREE.Vector3(1, 0, 0);
        
        forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation.y);
        right.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation.y);
        
        // Determinar velocidad según modo
        let speed;
        if (this.isFlying) {
            speed = this.isFlyingFast ? this.flySpeedFast : this.flySpeed;
        } else {
            speed = this.isRunning ? this.runSpeed : this.moveSpeed;
        }
        
        const moveVector = new THREE.Vector3();
        moveVector.add(forward.multiplyScalar(this.inputVector.y * speed));
        moveVector.add(right.multiplyScalar(this.inputVector.x * speed));
        
        // Aplicar al velocity horizontal
        this.velocity.x = moveVector.x;
        this.velocity.z = moveVector.z;
        
        // Modo vuelo
        if (this.isFlying) {
            // Movimiento vertical en vuelo
            if (this.keys['Space']) {
                this.velocity.y = speed;
            } else if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) {
                this.velocity.y = -speed;
            } else {
                this.velocity.y *= 0.9;
            }
            
            // En modo vuelo, mover sin colisiones
            this.position.add(this.velocity.clone().multiplyScalar(deltaTime));
        } else {
            // Modo normal con física
            
            // Salto
            if ((this.keys['Space'] || this.keys['KeyE']) && this.isGrounded) {
                this.jump();
            }
            
            // Física del agua
            this.isInWater = this.position.y < window.game.waterManager.waterLevel;
            
            if (this.isInWater) {
                this.velocity.y *= 0.95;
                if (this.keys['Space']) {
                    this.velocity.y = 2;
                } else {
                    this.velocity.y -= 3 * deltaTime;
                }
                this.velocity.x *= 0.8;
                this.velocity.z *= 0.8;
            } else {
                // Gravedad
                this.velocity.y -= this.gravity * deltaTime;
            }
            
            // Aplicar movimiento con colisiones
            this.moveWithCollision(deltaTime);
        }
        
        // Actualizar cámara - Posición fija sin ajustes automáticos
        window.game.camera.position.copy(this.position);
        window.game.camera.position.y = this.position.y - (this.height - this.eyeHeight);
        window.game.camera.rotation.copy(this.rotation);
        
        // Debug info
        if (window.game.showDebug) {
            document.getElementById('velocity').textContent = 
                `${this.velocity.x.toFixed(2)}, ${this.velocity.y.toFixed(2)}, ${this.velocity.z.toFixed(2)}`;
            document.getElementById('grounded').textContent = this.isGrounded ? 'Sí' : 'No';
            document.getElementById('input').textContent = 
                `${this.inputVector.x.toFixed(2)}, ${this.inputVector.y.toFixed(2)}`;
        }
        
        // Actualizar bioma
        const biome = window.game.chunkManager.getBiomeAt(
            Math.floor(this.position.x),
            Math.floor(this.position.y),
            Math.floor(this.position.z)
        );
        const biomeData = CONSTANTS.BIOME_3D.BIOMES[biome];
        document.getElementById('biome').textContent = biomeData?.name || 'Desconocido';
    }

    moveWithCollision(deltaTime) {
        // Guardar posición anterior
        const oldPosition = this.position.clone();
        
        // Intentar mover en X y Z
        const horizontalMove = new THREE.Vector3(
            this.velocity.x * deltaTime,
            0,
            this.velocity.z * deltaTime
        );
        
        this.position.add(horizontalMove);
        
        // Verificar colisión horizontal
        if (this.checkCollision()) {
            // Revertir y probar cada eje por separado
            this.position.copy(oldPosition);
            
            // Probar X
            this.position.x += horizontalMove.x;
            if (this.checkCollision()) {
                this.position.x = oldPosition.x;
                this.velocity.x = 0;
            }
            
            // Probar Z
            this.position.z += horizontalMove.z;
            if (this.checkCollision()) {
                this.position.z = oldPosition.z;
                this.velocity.z = 0;
            }
        }
        
        // Mover en Y
        this.position.y += this.velocity.y * deltaTime;
        
        // Verificar colisión vertical
        const groundCheck = this.getGroundHeight();
        const minY = groundCheck + this.height;
        
        if (this.position.y < minY) {
            this.position.y = minY;
            if (this.velocity.y < 0) {
                this.velocity.y = 0;
                this.isGrounded = true;
            }
        } else {
            this.isGrounded = false;
        }
        
        // Límite del mundo
        if (this.position.y < -10) {
            this.position.set(0, 80, 0);
            this.velocity.set(0, 0, 0);
        }
    }

    checkCollision() {
        // No colisionar en modo vuelo
        if (this.isFlying) return false;
        
        // Verificar colisión con bloques alrededor del jugador
        const positions = [
            // Esquinas inferiores
            [this.radius, 0, this.radius],
            [-this.radius, 0, this.radius],
            [this.radius, 0, -this.radius],
            [-this.radius, 0, -this.radius],
            // Puntos medios
            [this.radius, -this.height/2, this.radius],
            [-this.radius, -this.height/2, this.radius],
            [this.radius, -this.height/2, -this.radius],
            [-this.radius, -this.height/2, -this.radius],
            // Esquinas superiores
            [this.radius, -this.height + 0.1, this.radius],
            [-this.radius, -this.height + 0.1, this.radius],
            [this.radius, -this.height + 0.1, -this.radius],
            [-this.radius, -this.height + 0.1, -this.radius]
        ];
        
        for (let offset of positions) {
            const checkX = Math.floor(this.position.x + offset[0]);
            const checkY = Math.floor(this.position.y + offset[1]);
            const checkZ = Math.floor(this.position.z + offset[2]);
            
            if (window.game.chunkManager.getBlock(checkX, checkY, checkZ) !== 0) {
                return true;
            }
        }
        
        return false;
    }

    getGroundHeight() {
        // Buscar el bloque más alto debajo del jugador
        let maxY = -Infinity;
        
        // Verificar en un área alrededor del jugador
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const checkX = Math.floor(this.position.x + dx * this.radius);
                const checkZ = Math.floor(this.position.z + dz * this.radius);
                
                for (let y = Math.floor(this.position.y); y >= 0; y--) {
                    if (window.game.chunkManager.getBlock(checkX, y, checkZ) !== 0) {
                        maxY = Math.max(maxY, y + 1);
                        break;
                    }
                }
            }
        }
        
        return maxY === -Infinity ? 0 : maxY;
    }

    jump() {
        if (this.isGrounded && !this.isInWater) {
            this.velocity.y = this.jumpSpeed;
            this.isGrounded = false;
        }
    }

    toggleFlying() {
        this.isFlying = !this.isFlying;
        if (this.isFlying) {
            this.velocity.y = 0;
            console.log('Modo vuelo activado');
        } else {
            console.log('Modo vuelo desactivado');
        }
    }

    handleSpacePress() {
        const currentTime = Date.now();
        
        if (currentTime - this.lastSpaceTime < this.spaceDoubleTapTime) {
            this.toggleFlying();
            this.lastSpaceTime = 0;
        } else {
            this.lastSpaceTime = currentTime;
            
            if (!this.isFlying && this.isGrounded) {
                this.jump();
            }
        }
    }

    getRaycastBlock() {
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(window.game.camera.quaternion);
        
        for (let distance = 0.5; distance < this.reach; distance += 0.1) {
            const point = window.game.camera.position.clone().add(direction.clone().multiplyScalar(distance));
            const x = Math.floor(point.x);
            const y = Math.floor(point.y);
            const z = Math.floor(point.z);
            
            if (window.game.chunkManager.getBlock(x, y, z) !== 0) {
                const blockCenter = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
                const toBlock = point.clone().sub(blockCenter);
                
                let normal = new THREE.Vector3();
                const abs = toBlock.clone();
                abs.x = Math.abs(abs.x);
                abs.y = Math.abs(abs.y);
                abs.z = Math.abs(abs.z);
                
                if (abs.x > abs.y && abs.x > abs.z) {
                    normal.x = Math.sign(toBlock.x);
                } else if (abs.y > abs.x && abs.y > abs.z) {
                    normal.y = Math.sign(toBlock.y);
                } else {
                    normal.z = Math.sign(toBlock.z);
                }
                
                return { position: new THREE.Vector3(x, y, z), normal };
            }
        }
        
        return null;
    }

    placeBlock() {
        const hit = this.getRaycastBlock();
        if (hit) {
            const newPos = hit.position.clone().add(hit.normal);
            
            // Verificar que no colisione con el jugador
            const playerMin = this.position.clone().sub(new THREE.Vector3(this.radius, this.height, this.radius));
            const playerMax = this.position.clone().add(new THREE.Vector3(this.radius, 0, this.radius));
            
            if (newPos.x < playerMin.x - 1 || newPos.x > playerMax.x ||
                newPos.y < playerMin.y - 1 || newPos.y > playerMax.y ||
                newPos.z < playerMin.z - 1 || newPos.z > playerMax.z) {
                
                const blockTypeMap = {
                    1: 3, // Piedra
                    2: 4, // Madera
                    3: 2, // Césped
                    4: 5, // Diamante
                    5: 6  // Arena
                };
                
                window.game.chunkManager.setBlock(newPos.x, newPos.y, newPos.z, blockTypeMap[this.selectedBlock]);
                this.createBlockParticles(newPos, true);
            }
        }
    }

    breakBlock() {
        const hit = this.getRaycastBlock();
        if (hit) {
            window.game.chunkManager.setBlock(hit.position.x, hit.position.y, hit.position.z, 0);
            this.createBlockParticles(hit.position, false);
        }
    }

    createBlockParticles(position, isPlace) {
        const particleCount = isPlace ? 5 : 10;
        const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        const material = new THREE.MeshBasicMaterial({ 
            color: isPlace ? 0xffffff : 0x888888 
        });
        
        for (let i = 0; i < particleCount; i++) {
            const particle = new THREE.Mesh(geometry, material);
            particle.position.copy(position).add(new THREE.Vector3(0.5, 0.5, 0.5));
            
            particle.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 0.2,
                Math.random() * 0.3,
                (Math.random() - 0.5) * 0.2
            );
            
            particle.lifetime = 1.0;
            window.game.scene.add(particle);
            
            const animateParticle = () => {
                particle.lifetime -= 0.02;
                
                if (particle.lifetime <= 0) {
                    window.game.scene.remove(particle);
                    geometry.dispose();
                    material.dispose();
                    return;
                }
                
                particle.position.add(particle.velocity);
                particle.velocity.y -= 0.01;
                particle.scale.setScalar(particle.lifetime);
                particle.material.opacity = particle.lifetime;
                particle.material.transparent = true;
                
                requestAnimationFrame(animateParticle);
            };
            
            animateParticle();
        }
    }

    updateInventoryUI() {
        document.querySelectorAll('.inventory-slot').forEach((slot, index) => {
            slot.classList.toggle('active', index === this.selectedBlock - 1);
        });
    }
}