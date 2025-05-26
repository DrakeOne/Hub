class Player {
    constructor() {
        // Posición y física
        this.position = new THREE.Vector3(0, 80, 0); // Spawn más alto para el nuevo terreno
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
        
        // Margen de seguridad para evitar clipping
        this.collisionMargin = 0.001; // 1mm de margen
        this.cameraCollisionRadius = 0.1; // Radio de colisión para la cámara
        
        // Posición real de la cámara (se actualiza después de colisiones)
        this.cameraPosition = new THREE.Vector3();
        
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
                this.velocity.y *= 0.9; // Fricción vertical
            }
            
            // Aplicar velocidad de vuelo (sin colisiones)
            this.position.add(this.velocity.clone().multiplyScalar(deltaTime));
        } else {
            // Salto normal
            if ((this.keys['Space'] || this.keys['KeyE']) && this.isGrounded) {
                this.jump();
            }
            
            // Física del agua
            this.isInWater = this.position.y < window.game.waterManager.waterLevel;
            
            if (this.isInWater) {
                // En agua
                this.velocity.y *= 0.95;
                if (this.keys['Space']) {
                    this.velocity.y = 2;
                } else {
                    this.velocity.y -= 3 * deltaTime;
                }
                this.velocity.x *= 0.8;
                this.velocity.z *= 0.8;
            } else {
                // Gravedad normal
                this.velocity.y -= this.gravity * deltaTime;
            }
            
            // Mover y verificar colisiones
            this.moveWithCollision(deltaTime);
        }
        
        // Actualizar posición de la cámara con colisión
        this.updateCameraPosition();
        
        // Debug info
        if (window.game.showDebug) {
            document.getElementById('velocity').textContent = 
                `${this.velocity.x.toFixed(2)}, ${this.velocity.y.toFixed(2)}, ${this.velocity.z.toFixed(2)}`;
            document.getElementById('grounded').textContent = this.isGrounded ? 'Sí' : 'No';
            document.getElementById('input').textContent = 
                `${this.inputVector.x.toFixed(2)}, ${this.inputVector.y.toFixed(2)}`;
        }
        
        // Actualizar bioma con sistema 3D
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
        
        // Aplicar movimiento horizontal con pequeños pasos para mejor detección
        const steps = Math.ceil(horizontalMove.length() / 0.1); // Pasos de máximo 0.1 unidades
        const stepVector = horizontalMove.clone().divideScalar(steps);
        
        for (let i = 0; i < steps; i++) {
            const testPos = this.position.clone().add(stepVector);
            
            if (!this.checkCollisionAt(testPos)) {
                this.position.copy(testPos);
            } else {
                // Intentar deslizarse contra la pared
                this.handleWallSlide(stepVector);
                break;
            }
        }
        
        // Mover en Y con detección de colisión
        const verticalMove = this.velocity.y * deltaTime;
        const verticalSteps = Math.ceil(Math.abs(verticalMove) / 0.1);
        const verticalStep = verticalMove / verticalSteps;
        
        for (let i = 0; i < verticalSteps; i++) {
            const testY = this.position.y + verticalStep;
            const testPos = new THREE.Vector3(this.position.x, testY, this.position.z);
            
            if (!this.checkCollisionAt(testPos)) {
                this.position.y = testY;
            } else {
                // Colisión vertical
                if (this.velocity.y < 0) {
                    // Tocando el suelo
                    this.isGrounded = true;
                    this.velocity.y = 0;
                    
                    // Ajustar posición al suelo más cercano
                    const groundY = this.findGroundLevel(this.position.x, this.position.y, this.position.z);
                    if (groundY !== null) {
                        this.position.y = groundY + this.height;
                    }
                } else {
                    // Golpeando el techo
                    this.velocity.y = 0;
                }
                break;
            }
        }
        
        // Verificar si sigue en el suelo
        if (this.isGrounded) {
            const groundCheck = new THREE.Vector3(this.position.x, this.position.y - 0.1, this.position.z);
            this.isGrounded = this.checkCollisionAt(groundCheck);
        }
        
        // Límite del mundo
        if (this.position.y < -10) {
            this.position.set(0, 80, 0);
            this.velocity.set(0, 0, 0);
        }
    }

    handleWallSlide(moveVector) {
        // Intentar mover solo en X
        const xOnly = new THREE.Vector3(moveVector.x, 0, 0);
        if (!this.checkCollisionAt(this.position.clone().add(xOnly))) {
            this.position.add(xOnly);
            this.velocity.z = 0;
            return;
        }
        
        // Intentar mover solo en Z
        const zOnly = new THREE.Vector3(0, 0, moveVector.z);
        if (!this.checkCollisionAt(this.position.clone().add(zOnly))) {
            this.position.add(zOnly);
            this.velocity.x = 0;
            return;
        }
        
        // No se puede mover en ninguna dirección
        this.velocity.x = 0;
        this.velocity.z = 0;
    }

    checkCollisionAt(testPosition) {
        // No colisionar en modo vuelo
        if (this.isFlying) return false;
        
        // Puntos de colisión del cuerpo (hitbox de 0.6x1.8x0.6)
        const bodyPoints = this.getCollisionPoints(testPosition);
        
        for (let point of bodyPoints) {
            const blockX = Math.floor(point.x);
            const blockY = Math.floor(point.y);
            const blockZ = Math.floor(point.z);
            
            if (window.game.chunkManager.getBlock(blockX, blockY, blockZ) !== 0) {
                return true;
            }
        }
        
        return false;
    }

    getCollisionPoints(position) {
        const points = [];
        const margin = this.collisionMargin;
        const r = this.radius - margin;
        
        // Puntos en la base (pies)
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
            points.push(new THREE.Vector3(
                position.x + Math.cos(angle) * r,
                position.y - this.height + margin,
                position.z + Math.sin(angle) * r
            ));
        }
        
        // Puntos en el medio
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
            points.push(new THREE.Vector3(
                position.x + Math.cos(angle) * r,
                position.y - this.height / 2,
                position.z + Math.sin(angle) * r
            ));
        }
        
        // Puntos en la cabeza
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
            points.push(new THREE.Vector3(
                position.x + Math.cos(angle) * r,
                position.y - margin,
                position.z + Math.sin(angle) * r
            ));
        }
        
        // Punto central en cada altura
        points.push(new THREE.Vector3(position.x, position.y - this.height + margin, position.z));
        points.push(new THREE.Vector3(position.x, position.y - this.height / 2, position.z));
        points.push(new THREE.Vector3(position.x, position.y - margin, position.z));
        
        return points;
    }

    findGroundLevel(x, y, z) {
        // Buscar el nivel del suelo más alto debajo de la posición
        for (let checkY = Math.floor(y); checkY >= 0; checkY--) {
            if (window.game.chunkManager.getBlock(Math.floor(x), checkY, Math.floor(z)) !== 0) {
                return checkY + 1;
            }
        }
        return null;
    }

    updateCameraPosition() {
        // Posición base de la cámara
        const baseCameraPos = this.position.clone();
        baseCameraPos.y = this.position.y - (this.height - this.eyeHeight);
        
        // Si estamos en modo vuelo, no hacer colisión de cámara
        if (this.isFlying) {
            this.cameraPosition.copy(baseCameraPos);
            window.game.camera.position.copy(this.cameraPosition);
            window.game.camera.rotation.copy(this.rotation);
            return;
        }
        
        // Verificar colisión de la cámara
        let finalCameraPos = baseCameraPos.clone();
        
        // Ajustar la cámara si está dentro de un bloque
        const cameraBlock = this.getBlockAtPosition(finalCameraPos);
        if (cameraBlock !== 0) {
            // Intentar mover la cámara hacia abajo hasta encontrar espacio libre
            let adjusted = false;
            for (let offset = 0.1; offset <= 0.5; offset += 0.1) {
                const testPos = baseCameraPos.clone();
                testPos.y -= offset;
                
                if (this.getBlockAtPosition(testPos) === 0) {
                    finalCameraPos = testPos;
                    adjusted = true;
                    break;
                }
            }
            
            // Si no se pudo ajustar hacia abajo, intentar hacia adelante
            if (!adjusted) {
                const forward = new THREE.Vector3(0, 0, -0.2);
                forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation.y);
                const testPos = baseCameraPos.clone().add(forward);
                
                if (this.getBlockAtPosition(testPos) === 0) {
                    finalCameraPos = testPos;
                }
            }
        }
        
        // Verificar que la cámara no esté demasiado cerca de bloques circundantes
        this.adjustCameraForNearbyBlocks(finalCameraPos);
        
        // Aplicar posición final
        this.cameraPosition.copy(finalCameraPos);
        window.game.camera.position.copy(this.cameraPosition);
        window.game.camera.rotation.copy(this.rotation);
    }

    adjustCameraForNearbyBlocks(cameraPos) {
        const checkRadius = this.cameraCollisionRadius;
        const adjustments = [];
        
        // Verificar bloques cercanos en todas las direcciones
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    if (dx === 0 && dy === 0 && dz === 0) continue;
                    
                    const checkX = Math.floor(cameraPos.x + dx * checkRadius);
                    const checkY = Math.floor(cameraPos.y + dy * checkRadius);
                    const checkZ = Math.floor(cameraPos.z + dz * checkRadius);
                    
                    if (window.game.chunkManager.getBlock(checkX, checkY, checkZ) !== 0) {
                        // Calcular vector de alejamiento
                        const blockCenter = new THREE.Vector3(
                            checkX + 0.5,
                            checkY + 0.5,
                            checkZ + 0.5
                        );
                        
                        const pushVector = cameraPos.clone().sub(blockCenter);
                        const distance = pushVector.length();
                        
                        if (distance < 0.5 + checkRadius) {
                            pushVector.normalize();
                            const pushAmount = (0.5 + checkRadius) - distance;
                            adjustments.push(pushVector.multiplyScalar(pushAmount));
                        }
                    }
                }
            }
        }
        
        // Aplicar todos los ajustes
        for (let adjustment of adjustments) {
            cameraPos.add(adjustment);
        }
    }

    getBlockAtPosition(position) {
        return window.game.chunkManager.getBlock(
            Math.floor(position.x),
            Math.floor(position.y),
            Math.floor(position.z)
        );
    }

    checkCollision() {
        return this.checkCollisionAt(this.position);
    }

    getGroundHeight() {
        // Buscar el bloque más alto debajo del jugador
        let maxY = -Infinity;
        
        // Verificar en un área alrededor del jugador (hitbox de 0.6x0.6)
        const checkPoints = [
            [0, 0],
            [this.radius, 0],
            [-this.radius, 0],
            [0, this.radius],
            [0, -this.radius],
            [this.radius, this.radius],
            [-this.radius, this.radius],
            [this.radius, -this.radius],
            [-this.radius, -this.radius]
        ];
        
        for (let [dx, dz] of checkPoints) {
            const checkX = Math.floor(this.position.x + dx);
            const checkZ = Math.floor(this.position.z + dz);
            
            for (let y = Math.floor(this.position.y); y >= 0; y--) {
                if (window.game.chunkManager.getBlock(checkX, y, checkZ) !== 0) {
                    maxY = Math.max(maxY, y + 1);
                    break;
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
            this.velocity.y = 0; // Detener caída al activar vuelo
            console.log('Modo vuelo activado');
        } else {
            console.log('Modo vuelo desactivado');
        }
    }

    handleSpacePress() {
        const currentTime = Date.now();
        
        if (currentTime - this.lastSpaceTime < this.spaceDoubleTapTime) {
            // Doble tap detectado
            this.toggleFlying();
            this.lastSpaceTime = 0; // Reset para evitar triple tap
        } else {
            // Primer tap
            this.lastSpaceTime = currentTime;
            
            // Si no está volando, intentar saltar
            if (!this.isFlying && this.isGrounded) {
                this.jump();
            }
        }
    }

    getRaycastBlock() {
        const direction = new THREE.Vector3(0, 0, -1);
        direction.applyQuaternion(window.game.camera.quaternion);
        
        // Buscar bloques en la dirección de la vista
        for (let distance = 0.5; distance < this.reach; distance += 0.1) {
            const point = window.game.camera.position.clone().add(direction.clone().multiplyScalar(distance));
            const x = Math.floor(point.x);
            const y = Math.floor(point.y);
            const z = Math.floor(point.z);
            
            if (window.game.chunkManager.getBlock(x, y, z) !== 0) {
                // Determinar la cara del bloque
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
            // Usar hitbox exacta de Minecraft
            const playerMin = this.position.clone().sub(new THREE.Vector3(this.radius, this.height, this.radius));
            const playerMax = this.position.clone().add(new THREE.Vector3(this.radius, 0, this.radius));
            
            // Verificar que el bloque no se superponga con el jugador
            const blockMin = newPos.clone();
            const blockMax = newPos.clone().add(new THREE.Vector3(1, 1, 1));
            
            // Comprobar superposición
            const overlap = !(blockMax.x <= playerMin.x || blockMin.x >= playerMax.x ||
                            blockMax.y <= playerMin.y || blockMin.y >= playerMax.y ||
                            blockMax.z <= playerMin.z || blockMin.z >= playerMax.z);
            
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