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
        
        // Dimensiones del jugador - Sistema simplificado
        this.height = 1.8;  // Altura total
        this.width = 0.6;   // Ancho del jugador
        
        // Posición de la cámara relativa a los pies
        // En Minecraft la cámara está a 1.62m del suelo
        // Pero vamos a ajustarla para evitar clipping
        this.cameraOffset = 1.52; // Bajamos la cámara 10cm para dar margen
        
        // Sistema de colisión simplificado
        this.skinWidth = 0.05; // 5cm de margen para evitar quedarse pegado
        
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
        // Recopilar input
        if (!this.isMobile) {
            this.inputVector.set(0, 0);
            if (this.keys['KeyW'] || this.keys['ArrowUp']) this.inputVector.y -= 1;
            if (this.keys['KeyS'] || this.keys['ArrowDown']) this.inputVector.y += 1;
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
        
        // Actualizar cámara con posición segura
        this.updateCamera();
        
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
        // Sistema de colisión mejorado tipo Minecraft
        const movement = this.velocity.clone().multiplyScalar(deltaTime);
        
        // Separar movimiento en componentes
        const moveX = new THREE.Vector3(movement.x, 0, 0);
        const moveY = new THREE.Vector3(0, movement.y, 0);
        const moveZ = new THREE.Vector3(0, 0, movement.z);
        
        // Aplicar movimiento en Y primero (gravedad/salto)
        const newPosY = this.position.clone().add(moveY);
        if (!this.checkCollisionBox(newPosY)) {
            this.position.y = newPosY.y;
            this.isGrounded = false;
        } else {
            if (this.velocity.y < 0) {
                // Cayendo - ajustar al piso
                this.isGrounded = true;
                this.velocity.y = 0;
                
                // Encontrar la altura exacta del piso
                let floorY = Math.floor(this.position.y);
                while (floorY > 0 && !this.isBlockSolid(this.position.x, floorY - 1, this.position.z)) {
                    floorY--;
                }
                this.position.y = floorY;
            } else {
                // Golpeando techo
                this.velocity.y = 0;
            }
        }
        
        // Aplicar movimiento en X
        const newPosX = this.position.clone().add(moveX);
        if (!this.checkCollisionBox(newPosX)) {
            this.position.x = newPosX.x;
        } else {
            this.velocity.x = 0;
            
            // Intentar subir escalón (step up)
            if (this.isGrounded) {
                const stepUp = newPosX.clone();
                stepUp.y += 0.6; // Altura máxima de escalón
                
                if (!this.checkCollisionBox(stepUp)) {
                    // Verificar si hay piso donde pisar
                    const stepForward = stepUp.clone();
                    stepForward.y -= 0.6;
                    
                    if (this.checkCollisionBox(stepForward)) {
                        // Hay piso, subir el escalón
                        this.position.x = stepUp.x;
                        this.position.y = stepUp.y;
                    }
                }
            }
        }
        
        // Aplicar movimiento en Z
        const newPosZ = this.position.clone().add(moveZ);
        if (!this.checkCollisionBox(newPosZ)) {
            this.position.z = newPosZ.z;
        } else {
            this.velocity.z = 0;
            
            // Intentar subir escalón
            if (this.isGrounded) {
                const stepUp = newPosZ.clone();
                stepUp.y += 0.6;
                
                if (!this.checkCollisionBox(stepUp)) {
                    const stepForward = stepUp.clone();
                    stepForward.y -= 0.6;
                    
                    if (this.checkCollisionBox(stepForward)) {
                        this.position.z = stepUp.z;
                        this.position.y = stepUp.y;
                    }
                }
            }
        }
        
        // Verificar si seguimos en el suelo
        if (this.isGrounded) {
            const groundCheck = this.position.clone();
            groundCheck.y -= 0.1;
            this.isGrounded = this.checkCollisionBox(groundCheck);
        }
        
        // Límite del mundo
        if (this.position.y < -10) {
            this.position.set(0, 80, 0);
            this.velocity.set(0, 0, 0);
        }
    }

    checkCollisionBox(testPos) {
        // Sistema de colisión AABB simplificado
        const halfWidth = (this.width / 2) - this.skinWidth;
        
        // Puntos a verificar (esquinas del bounding box)
        const checkPoints = [
            // Pies
            { x: testPos.x - halfWidth, y: testPos.y - this.height, z: testPos.z - halfWidth },
            { x: testPos.x + halfWidth, y: testPos.y - this.height, z: testPos.z - halfWidth },
            { x: testPos.x - halfWidth, y: testPos.y - this.height, z: testPos.z + halfWidth },
            { x: testPos.x + halfWidth, y: testPos.y - this.height, z: testPos.z + halfWidth },
            // Cabeza
            { x: testPos.x - halfWidth, y: testPos.y - this.skinWidth, z: testPos.z - halfWidth },
            { x: testPos.x + halfWidth, y: testPos.y - this.skinWidth, z: testPos.z - halfWidth },
            { x: testPos.x - halfWidth, y: testPos.y - this.skinWidth, z: testPos.z + halfWidth },
            { x: testPos.x + halfWidth, y: testPos.y - this.skinWidth, z: testPos.z + halfWidth },
            // Centro
            { x: testPos.x - halfWidth, y: testPos.y - this.height/2, z: testPos.z - halfWidth },
            { x: testPos.x + halfWidth, y: testPos.y - this.height/2, z: testPos.z - halfWidth },
            { x: testPos.x - halfWidth, y: testPos.y - this.height/2, z: testPos.z + halfWidth },
            { x: testPos.x + halfWidth, y: testPos.y - this.height/2, z: testPos.z + halfWidth }
        ];
        
        // Verificar cada punto
        for (let point of checkPoints) {
            if (this.isBlockSolid(point.x, point.y, point.z)) {
                return true;
            }
        }
        
        return false;
    }

    isBlockSolid(x, y, z) {
        return window.game.chunkManager.getBlock(
            Math.floor(x),
            Math.floor(y),
            Math.floor(z)
        ) !== 0;
    }

    updateCamera() {
        // Posición base de la cámara
        let cameraY = this.position.y - (this.height - this.cameraOffset);
        
        // En modo vuelo, usar posición directa
        if (this.isFlying) {
            window.game.camera.position.set(
                this.position.x,
                cameraY,
                this.position.z
            );
            window.game.camera.rotation.copy(this.rotation);
            return;
        }
        
        // Verificar si la cámara estaría dentro de un bloque
        const cameraBlockY = Math.floor(cameraY);
        const headRoom = cameraY - cameraBlockY;
        
        // Si hay un bloque donde estaría la cámara
        if (this.isBlockSolid(this.position.x, cameraY, this.position.z)) {
            // Bajar la cámara hasta encontrar espacio
            let adjustedY = cameraY;
            let found = false;
            
            // Buscar hacia abajo hasta 0.5 unidades
            for (let offset = 0.1; offset <= 0.5; offset += 0.1) {
                const testY = cameraY - offset;
                if (!this.isBlockSolid(this.position.x, testY, this.position.z)) {
                    adjustedY = testY;
                    found = true;
                    break;
                }
            }
            
            // Si no encontramos espacio abajo, mantener la cámara lo más baja posible
            if (!found) {
                adjustedY = Math.floor(cameraY) - 0.1;
            }
            
            cameraY = adjustedY;
        }
        
        // Verificar techo bajo (espacio de menos de 2 bloques)
        const blockAbove = this.isBlockSolid(this.position.x, this.position.y, this.position.z);
        if (blockAbove) {
            // Ajustar cámara para espacios bajos
            const maxCameraY = this.position.y - 0.3; // 30cm debajo del techo
            cameraY = Math.min(cameraY, maxCameraY);
        }
        
        // Aplicar posición final de la cámara
        window.game.camera.position.set(
            this.position.x,
            cameraY,
            this.position.z
        );
        window.game.camera.rotation.copy(this.rotation);
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
            const blockMin = newPos.clone();
            const blockMax = newPos.clone().add(new THREE.Vector3(1, 1, 1));
            
            const playerMin = new THREE.Vector3(
                this.position.x - this.width/2,
                this.position.y - this.height,
                this.position.z - this.width/2
            );
            const playerMax = new THREE.Vector3(
                this.position.x + this.width/2,
                this.position.y,
                this.position.z + this.width/2
            );
            
            // Verificar superposición
            const overlap = !(
                blockMax.x <= playerMin.x || blockMin.x >= playerMax.x ||
                blockMax.y <= playerMin.y || blockMin.y >= playerMax.y ||
                blockMax.z <= playerMin.z || blockMin.z >= playerMax.z
            );
            
            if (!overlap) {
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