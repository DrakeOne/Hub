class ChunkManager {
    constructor() {
        this.chunks = new Map();
        this.chunkSize = CONSTANTS.CHUNK_SIZE;
        this.chunkHeight = CONSTANTS.CHUNK_HEIGHT;
        this.renderDistance = CONSTANTS.RENDER_DISTANCE;
        this.seed = Math.random() * 10000;
        
        // Initialize SimplexNoise
        this.noise = new SimplexNoise(this.seed);
        
        // Initialize 3D biome provider
        this.biomeProvider = new BiomeProvider3D(this.seed);
        
        // Initialize tree system
        this.treeSystem = new TreeSystem(this.seed);
        
        this.blockTypes = CONSTANTS.BLOCK_TYPES;
        
        // Use object pool if available, otherwise create normally
        this.blockGeometry = window.objectPool ? 
            window.objectPool.getBoxGeometry(1, 1, 1) : 
            new THREE.BoxGeometry(1, 1, 1);
            
        this.materials = {};
        
        // Pre-create materials using pool if available
        for (let type in this.blockTypes) {
            if (this.blockTypes[type]) {
                // Handle transparent blocks differently
                if (this.blockTypes[type].transparent) {
                    this.materials[type] = window.objectPool ?
                        window.objectPool.getMaterial('lambert', this.blockTypes[type].color, {
                            transparent: true,
                            opacity: 0.8,
                            alphaTest: 0.5
                        }) :
                        new THREE.MeshLambertMaterial({ 
                            color: this.blockTypes[type].color,
                            transparent: true,
                            opacity: 0.8,
                            alphaTest: 0.5
                        });
                } else {
                    this.materials[type] = window.objectPool ?
                        window.objectPool.getMaterial('lambert', this.blockTypes[type].color) :
                        new THREE.MeshLambertMaterial({ color: this.blockTypes[type].color });
                }
            }
        }

        // 3D generation parameters
        this.generationParams = CONSTANTS.GENERATION_3D;
        
        // Debug logging system
        this.debugLogger = new ChunkDebugLogger();
        
        // Rendering optimization
        this.frustum = new THREE.Frustum();
        this.cameraMatrix = new THREE.Matrix4();
        
        // Reference to object pool
        this.objectPool = window.objectPool || null;
        
        // Reference to persistence system
        this.blockPersistence = window.blockPersistence || null;
        
        // Sistema de colisiones separado
        this.collisionChunks = new Map();
        
        // Player velocity tracking for prediction
        this.playerVelocity = { x: 0, z: 0 };
        this.lastPlayerPos = { x: 0, z: 0 };
        this.lastUpdateTime = performance.now();
        
        // Cola de generación
        this.generationQueue = [];
        this.isGenerating = false;
        
        // NUEVO: Cache de árboles pendientes para cross-chunk
        this.pendingTreesCache = new Map();
        this.TREE_OVERLAP_RADIUS = 8; // Radio máximo de árboles
        
        // Web Worker para generación sin lag
        this.worker = null;
        this.workerBusy = false;
        this.pendingWorkerTasks = new Map();
        this.initializeWorker();
        
        // Iniciar procesamiento
        this.startProcessing();
    }

    // Inicializar Web Worker
    initializeWorker() {
        if (typeof Worker !== 'undefined') {
            try {
                this.worker = new Worker('js/workers/chunk-generator.js');
                
                this.worker.onmessage = (e) => {
                    const { type, data } = e.data;
                    
                    switch (type) {
                        case 'loaded':
                            console.log('[ChunkManager] Web Worker cargado');
                            // Inicializar con semilla
                            this.worker.postMessage({
                                type: 'init',
                                data: { seed: this.seed }
                            });
                            break;
                            
                        case 'ready':
                            console.log('[ChunkManager] Web Worker listo para generar chunks');
                            this.workerBusy = false;
                            break;
                            
                        case 'chunk':
                            this.handleWorkerChunk(data);
                            break;
                            
                        case 'error':
                            console.error('[ChunkManager] Error en Web Worker:', data.error);
                            this.workerBusy = false;
                            // Generar chunk de forma tradicional como fallback
                            this.generateChunkFallback(data.chunkX, data.chunkZ);
                            break;
                    }
                };
                
                this.worker.onerror = (error) => {
                    console.error('[ChunkManager] Error fatal en Web Worker:', error);
                    this.worker = null;
                };
                
            } catch (error) {
                console.warn('[ChunkManager] No se pudo crear Web Worker:', error);
                this.worker = null;
            }
        }
    }

    // Manejar chunk recibido del worker
    handleWorkerChunk(data) {
        const { chunkX, chunkZ, blocks, surfaceMap, generationTime } = data;
        const key = `${chunkX},${chunkZ}`;
        
        console.log(`[ChunkManager] Chunk ${key} generado en ${generationTime.toFixed(2)}ms por Web Worker`);
        
        // Crear estructura de chunk
        const chunk = {
            x: chunkX,
            z: chunkZ,
            data: new ChunkData(this.chunkSize, this.chunkHeight, this.chunkSize),
            mesh: new THREE.Group(),
            isDirty: true,
            biomes: new Map(),
            trees: []
        };
        
        // Copiar bloques del worker
        chunk.data.blocks = new Uint8Array(blocks);
        chunk.data.isEmpty = false;
        
        // Contar bloques
        let blockCount = 0;
        for (let i = 0; i < chunk.data.blocks.length; i++) {
            if (chunk.data.blocks[i] !== 0) blockCount++;
        }
        chunk.data.blockCount = blockCount;
        
        // Aplicar árboles pendientes de otros chunks
        this.applyPendingTrees(chunk);
        
        // Generar vegetación (esto aún se hace en el hilo principal por ahora)
        const surfaceMapProcessed = new Map();
        for (const surface of surfaceMap) {
            surfaceMapProcessed.set(`${surface.x},${surface.z}`, surface);
        }
        this.generateVegetationWithOverlap(chunk, surfaceMapProcessed);
        
        // Construir mesh
        this.buildChunkMesh(chunk);
        
        // Agregar a la escena
        if (chunk.mesh) {
            window.game.scene.add(chunk.mesh);
        }
        
        // Guardar chunk
        this.chunks.set(key, chunk);
        this.collisionChunks.set(key, chunk.data);
        
        // Marcar worker como disponible
        this.workerBusy = false;
        
        // Procesar siguiente tarea pendiente si hay
        if (this.pendingWorkerTasks.size > 0) {
            const [nextKey, nextTask] = this.pendingWorkerTasks.entries().next().value;
            this.pendingWorkerTasks.delete(nextKey);
            this.generateChunkWithWorker(nextTask.x, nextTask.z);
        }
    }

    // Generar chunk usando Web Worker
    generateChunkWithWorker(chunkX, chunkZ) {
        if (!this.worker) {
            // Si no hay worker, usar método tradicional
            return this.generateChunkFallback(chunkX, chunkZ);
        }
        
        const key = `${chunkX},${chunkZ}`;
        
        if (this.workerBusy) {
            // Si el worker está ocupado, agregar a cola
            this.pendingWorkerTasks.set(key, { x: chunkX, z: chunkZ });
            return;
        }
        
        this.workerBusy = true;
        
        // Enviar tarea al worker
        this.worker.postMessage({
            type: 'generate',
            data: {
                chunkX: chunkX,
                chunkZ: chunkZ
            }
        });
    }

    // Fallback para generar chunk sin worker
    generateChunkFallback(chunkX, chunkZ) {
        const chunk = this.generateChunk(chunkX, chunkZ);
        this.buildChunkMesh(chunk);
        
        if (chunk.mesh) {
            window.game.scene.add(chunk.mesh);
        }
        
        const key = `${chunkX},${chunkZ}`;
        this.chunks.set(key, chunk);
        this.collisionChunks.set(key, chunk.data);
    }

    getChunkKey(x, z) {
        return `${Math.floor(x / this.chunkSize)},${Math.floor(z / this.chunkSize)}`;
    }
    
    // NUEVO: Obtener coordenadas de chunk desde coordenadas mundiales
    getChunkCoords(worldX, worldZ) {
        return {
            x: Math.floor(worldX / this.chunkSize),
            z: Math.floor(worldZ / this.chunkSize)
        };
    }
    
    // NUEVO: Obtener chunks en un radio
    getChunksInRadius(centerChunkX, centerChunkZ, radius) {
        const chunks = [];
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                chunks.push({
                    x: centerChunkX + dx,
                    z: centerChunkZ + dz,
                    key: `${centerChunkX + dx},${centerChunkZ + dz}`
                });
            }
        }
        return chunks;
    }
    
    // NUEVO: Determinar qué chunks son afectados por un conjunto de bloques
    getAffectedChunks(blocks) {
        const affectedChunks = new Map();
        
        for (const block of blocks) {
            const chunkCoords = this.getChunkCoords(block.x, block.z);
            const key = `${chunkCoords.x},${chunkCoords.z}`;
            
            if (!affectedChunks.has(key)) {
                affectedChunks.set(key, {
                    x: chunkCoords.x,
                    z: chunkCoords.z,
                    key: key,
                    blocks: []
                });
            }
            
            affectedChunks.get(key).blocks.push(block);
        }
        
        return affectedChunks;
    }

    // Calculate 3D density with 3D biomes
    calculateDensity(worldX, worldY, worldZ) {
        // Get 3D biome
        const biomeId = this.biomeProvider.getBiome3D(worldX, worldY, worldZ);
        const biomeData = CONSTANTS.BIOME_3D.BIOMES[biomeId];
        
        // Base density with biome height
        let density = biomeData.baseHeight - worldY;
        
        // Apply biome modifier
        density *= biomeData.densityModifier;
        
        // Primary 3D noise (large forms)
        const primaryNoise = this.noise.noise3D(
            worldX * this.generationParams.NOISE_SCALES.primary,
            worldY * this.generationParams.NOISE_SCALES.primary * 0.5,
            worldZ * this.generationParams.NOISE_SCALES.primary
        );
        
        // Secondary 3D noise (medium variations)
        const secondaryNoise = this.noise.noise3D(
            worldX * this.generationParams.NOISE_SCALES.secondary + 100,
            worldY * this.generationParams.NOISE_SCALES.secondary * 0.5 + 100,
            worldZ * this.generationParams.NOISE_SCALES.secondary + 100
        );
        
        // Detail 3D noise (small variations)
        const detailNoise = this.noise.noise3D(
            worldX * this.generationParams.NOISE_SCALES.detail + 200,
            worldY * this.generationParams.NOISE_SCALES.detail * 0.5 + 200,
            worldZ * this.generationParams.NOISE_SCALES.detail + 200
        );
        
        // Apply noise with amplitudes based on biome height variation
        const heightVar = biomeData.heightVariation;
        density += primaryNoise * this.generationParams.NOISE_AMPLITUDES.primary * heightVar;
        density += secondaryNoise * this.generationParams.NOISE_AMPLITUDES.secondary * heightVar * 0.5;
        density += detailNoise * this.generationParams.NOISE_AMPLITUDES.detail * heightVar * 0.25;
        
        // 3D caves only underground
        if (worldY < biomeData.baseHeight - 5) {
            const caveNoise = this.noise.noise3D(
                worldX * this.generationParams.NOISE_SCALES.cave,
                worldY * this.generationParams.NOISE_SCALES.cave,
                worldZ * this.generationParams.NOISE_SCALES.cave
            );
            
            const caveNoise2 = this.noise.noise3D(
                worldX * this.generationParams.NOISE_SCALES.cave * 2 + 1000,
                worldY * this.generationParams.NOISE_SCALES.cave * 2 + 1000,
                worldZ * this.generationParams.NOISE_SCALES.cave * 2 + 1000
            );
            
            // Swiss cheese cave system
            if (Math.abs(caveNoise) > biomeData.caveThreshold || 
                Math.abs(caveNoise2) > biomeData.caveThreshold * 0.8) {
                density -= 50;
            }
            
            // Spaghetti caves
            const spaghettiCave = Math.abs(caveNoise * caveNoise2);
            if (spaghettiCave > 0.3 && worldY < biomeData.baseHeight - 10) {
                density -= 30;
            }
        }
        
        // Avoid generation below Y=0
        if (worldY < 0) {
            density += Math.abs(worldY) * 2;
        }
        
        return density;
    }

    // Generar chunk completo
    generateChunk(chunkX, chunkZ) {
        const chunkData = new ChunkData(this.chunkSize, this.chunkHeight, this.chunkSize);
        
        const chunk = {
            x: chunkX,
            z: chunkZ,
            data: chunkData,
            mesh: new THREE.Group(),
            isDirty: true,
            biomes: new Map(),
            trees: [] // Para almacenar referencias a árboles
        };
        
        // Generar terreno
        const surfaceMap = new Map(); // Para rastrear superficies
        
        for (let x = 0; x < this.chunkSize; x++) {
            for (let z = 0; z < this.chunkSize; z++) {
                const worldX = chunkX * this.chunkSize + x;
                const worldZ = chunkZ * this.chunkSize + z;
                
                let surfaceY = -1;
                
                // Generar columna
                for (let y = 0; y < this.chunkHeight; y++) {
                    const density = this.calculateDensity(worldX, y, worldZ);
                    
                    if (density > this.generationParams.DENSITY_THRESHOLD) {
                        chunk.data.setBlock(x, y, z, 3); // Piedra
                        surfaceY = y;
                    }
                }
                
                // Aplicar superficie
                if (surfaceY > -1) {
                    const surfaceBiome = this.biomeProvider.getBiome3D(worldX, surfaceY, worldZ);
                    const biomeData = CONSTANTS.BIOME_3D.BIOMES[surfaceBiome];
                    
                    // Superficie
                    chunk.data.setBlock(x, surfaceY, z, biomeData.surfaceBlock);
                    
                    // Subsuperficie
                    for (let y = surfaceY - 1; y >= Math.max(0, surfaceY - 3); y--) {
                        if (chunk.data.getBlock(x, y, z) === 3) {
                            chunk.data.setBlock(x, y, z, biomeData.subsurfaceBlock);
                        }
                    }
                    
                    // Guardar superficie para generación de árboles
                    surfaceMap.set(`${x},${z}`, { y: surfaceY, biome: surfaceBiome });
                }
            }
        }
        
        // NUEVO: Aplicar árboles pendientes de otros chunks
        this.applyPendingTrees(chunk);
        
        // Generar vegetación con soporte cross-chunk
        this.generateVegetationWithOverlap(chunk, surfaceMap);
        
        return chunk;
    }
    
    // NUEVO: Aplicar árboles pendientes de otros chunks
    applyPendingTrees(chunk) {
        const chunkKey = `${chunk.x},${chunk.z}`;
        
        if (this.pendingTreesCache.has(chunkKey)) {
            const pendingTrees = this.pendingTreesCache.get(chunkKey);
            
            for (const treeData of pendingTrees) {
                this.applyTreeToChunk(chunk, treeData.blocks);
                
                // Agregar referencia del árbol
                chunk.trees.push({
                    worldX: treeData.x,
                    worldY: treeData.y,
                    worldZ: treeData.z,
                    type: treeData.type,
                    fromOtherChunk: true
                });
            }
            
            // Limpiar cache
            this.pendingTreesCache.delete(chunkKey);
        }
    }

    // NUEVO: Generar vegetación con soporte para árboles cross-chunk
    generateVegetationWithOverlap(chunk, surfaceMap) {
        const treePositions = [];
        
        // Iterar sobre las posiciones de superficie
        for (const [key, surface] of surfaceMap) {
            const [x, z] = key.split(',').map(Number);
            const worldX = chunk.x * this.chunkSize + x;
            const worldZ = chunk.z * this.chunkSize + z;
            
            // Verificar si es una superficie válida para árboles
            if (surface.y < this.chunkHeight - 20 && surface.y > CONSTANTS.WATER_LEVEL) {
                // Verificar si debe generar un árbol
                if (this.treeSystem.shouldSpawnTree(worldX, worldZ, surface.biome, treePositions)) {
                    const treeType = this.treeSystem.getTreeTypeForBiome(surface.biome);
                    
                    if (treeType) {
                        // Generar estructura del árbol
                        const treeBlocks = this.treeSystem.generateTree(
                            worldX, 
                            surface.y + 1, 
                            worldZ, 
                            treeType.name
                        );
                        
                        // Determinar qué chunks son afectados por este árbol
                        const affectedChunks = this.getAffectedChunks(treeBlocks);
                        
                        // Aplicar bloques a todos los chunks afectados
                        for (const [affectedKey, affectedData] of affectedChunks) {
                            if (affectedKey === `${chunk.x},${chunk.z}`) {
                                // Es el chunk actual
                                this.applyTreeToChunk(chunk, affectedData.blocks);
                            } else {
                                // Es otro chunk - verificar si existe o guardarlo para después
                                const existingChunk = this.chunks.get(affectedKey);
                                
                                if (existingChunk) {
                                    // El chunk existe, aplicar directamente
                                    this.applyTreeToChunk(existingChunk, affectedData.blocks);
                                    existingChunk.isDirty = true;
                                    this.buildChunkMesh(existingChunk);
                                } else {
                                    // El chunk no existe aún, guardar para aplicar cuando se genere
                                    if (!this.pendingTreesCache.has(affectedKey)) {
                                        this.pendingTreesCache.set(affectedKey, []);
                                    }
                                    
                                    this.pendingTreesCache.get(affectedKey).push({
                                        x: worldX,
                                        y: surface.y + 1,
                                        z: worldZ,
                                        type: treeType.name,
                                        blocks: affectedData.blocks
                                    });
                                }
                            }
                        }
                        
                        // Guardar referencia del árbol
                        treePositions.push({
                            x: worldX,
                            y: surface.y + 1,
                            z: worldZ,
                            type: treeType.name
                        });
                        
                        chunk.trees.push({
                            localX: x,
                            localZ: z,
                            worldX: worldX,
                            worldY: surface.y + 1,
                            worldZ: worldZ,
                            type: treeType.name
                        });
                    }
                }
            }
        }
    }

    // Aplicar bloques de árbol al chunk (mejorado para manejar coordenadas correctamente)
    applyTreeToChunk(chunk, treeBlocks) {
        for (const block of treeBlocks) {
            // Calcular coordenadas locales del chunk
            const localX = block.x - (chunk.x * this.chunkSize);
            const localZ = block.z - (chunk.z * this.chunkSize);
            
            // Verificar límites
            if (localX >= 0 && localX < this.chunkSize &&
                block.y >= 0 && block.y < this.chunkHeight &&
                localZ >= 0 && localZ < this.chunkSize) {
                
                // Solo colocar si es aire o reemplazable
                const currentBlock = chunk.data.getBlock(localX, block.y, localZ);
                if (currentBlock === 0 || (currentBlock >= 14 && currentBlock <= 24)) {
                    chunk.data.setBlock(localX, block.y, localZ, block.type);
                }
            }
        }
    }

    // Método para limpiar el mesh de un chunk correctamente
    clearChunkMesh(chunk) {
        if (!chunk.mesh) return;
        
        chunk.mesh.traverse((child) => {
            if (child.geometry) {
                child.geometry.dispose();
            }
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
        
        chunk.mesh.clear();
    }

    // Construir mesh del chunk con Face Culling estilo Minecraft
    buildChunkMesh(chunk) {
        // Limpiar mesh anterior
        this.clearChunkMesh(chunk);
        
        // Estructuras para almacenar geometría por tipo de bloque
        const geometryData = new Map();
        const transparentGeometryData = new Map();
        
        // Definición de las 6 caras de un cubo
        const faces = {
            // Cara superior (+Y) - orden antihorario visto desde arriba
            top: {
                dir: [0, 1, 0],
                vertices: [
                    [-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5],
                    [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]
                ],
                normal: [0, 1, 0],
                uvs: [0, 0, 0, 1, 1, 1, 1, 0]
            },
            // Cara inferior (-Y) - CORREGIDO: orden antihorario visto desde abajo
            bottom: {
                dir: [0, -1, 0],
                vertices: [
                    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5],
                    [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]
                ],
                normal: [0, -1, 0],
                uvs: [0, 0, 1, 0, 1, 1, 0, 1]
            },
            // Cara frontal (+Z)
            front: {
                dir: [0, 0, 1],
                vertices: [
                    [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5],
                    [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]
                ],
                normal: [0, 0, 1],
                uvs: [0, 0, 1, 0, 1, 1, 0, 1]
            },
            // Cara trasera (-Z)
            back: {
                dir: [0, 0, -1],
                vertices: [
                    [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5],
                    [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]
                ],
                normal: [0, 0, -1],
                uvs: [0, 0, 1, 0, 1, 1, 0, 1]
            },
            // Cara derecha (+X)
            right: {
                dir: [1, 0, 0],
                vertices: [
                    [0.5, -0.5, 0.5], [0.5, -0.5, -0.5],
                    [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]
                ],
                normal: [1, 0, 0],
                uvs: [0, 0, 1, 0, 1, 1, 0, 1]
            },
            // Cara izquierda (-X)
            left: {
                dir: [-1, 0, 0],
                vertices: [
                    [-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5],
                    [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]
                ],
                normal: [-1, 0, 0],
                uvs: [0, 0, 1, 0, 1, 1, 0, 1]
            }
        };
        
        // Función para verificar si una cara debe renderizarse
        const shouldRenderFace = (chunk, x, y, z, face) => {
            const [dx, dy, dz] = face.dir;
            const nx = x + dx;
            const ny = y + dy;
            const nz = z + dz;
            
            // Obtener el tipo del bloque actual
            const currentType = chunk.data.getBlock(x, y, z);
            const currentBlockDef = this.blockTypes[currentType];
            const isCurrentTransparent = currentBlockDef && currentBlockDef.transparent;
            
            // Verificar el bloque vecino
            let neighborType;
            
            // Si está fuera de los límites del chunk
            if (nx < 0 || nx >= this.chunkSize || 
                ny < 0 || ny >= this.chunkHeight || 
                nz < 0 || nz >= this.chunkSize) {
                
                // Verificar en el chunk adyacente
                const worldX = chunk.x * this.chunkSize + nx;
                const worldZ = chunk.z * this.chunkSize + nz;
                neighborType = this.getBlock(worldX, ny, worldZ);
            } else {
                neighborType = chunk.data.getBlock(nx, ny, nz);
            }
            
            // Reglas de renderizado (igual que Minecraft):
            // 1. Si el vecino es aire (0), siempre renderizar
            if (neighborType === 0) return true;
            
            const neighborBlockDef = this.blockTypes[neighborType];
            const isNeighborTransparent = neighborBlockDef && neighborBlockDef.transparent;
            
            // 2. Si ambos son opacos, NO renderizar (esta es la clave del face culling)
            if (!isCurrentTransparent && !isNeighborTransparent) return false;
            
            // 3. Si el actual es transparente y el vecino es del mismo tipo, NO renderizar
            if (isCurrentTransparent && neighborType === currentType) return false;
            
            // 4. Si el actual es opaco y el vecino es transparente, SÍ renderizar
            if (!isCurrentTransparent && isNeighborTransparent) return true;
            
            // 5. Si el actual es transparente y el vecino es diferente, SÍ renderizar
            if (isCurrentTransparent && neighborType !== currentType) return true;
            
            return false;
        };
        
        // Iterar por todos los bloques del chunk
        for (let x = 0; x < this.chunkSize; x++) {
            for (let y = 0; y < this.chunkHeight; y++) {
                for (let z = 0; z < this.chunkSize; z++) {
                    const type = chunk.data.getBlock(x, y, z);
                    if (type === 0) continue; // Saltar aire
                    
                    const blockDef = this.blockTypes[type];
                    const isTransparent = blockDef && blockDef.transparent;
                    const targetMap = isTransparent ? transparentGeometryData : geometryData;
                    
                    // Verificar cada cara
                    let hasVisibleFace = false;
                    
                    for (const [faceName, faceData] of Object.entries(faces)) {
                        if (shouldRenderFace(chunk, x, y, z, faceData)) {
                            hasVisibleFace = true;
                            
                            // Inicializar arrays si no existen
                            if (!targetMap.has(type)) {
                                targetMap.set(type, {
                                    positions: [],
                                    normals: [],
                                    uvs: [],
                                    indices: []
                                });
                            }
                            
                            const data = targetMap.get(type);
                            const baseIndex = data.positions.length / 3;
                            
                            // Posición mundial del bloque
                            const worldX = chunk.x * this.chunkSize + x;
                            const worldY = y;
                            const worldZ = chunk.z * this.chunkSize + z;
                            
                            // Agregar vértices de la cara
                            for (const vertex of faceData.vertices) {
                                data.positions.push(
                                    worldX + vertex[0] + 0.5,
                                    worldY + vertex[1] + 0.5,
                                    worldZ + vertex[2] + 0.5
                                );
                                data.normals.push(...faceData.normal);
                            }
                            
                            // Agregar UVs
                            data.uvs.push(...faceData.uvs);
                            
                            // Agregar índices (2 triángulos por cara)
                            data.indices.push(
                                baseIndex, baseIndex + 1, baseIndex + 2,
                                baseIndex, baseIndex + 2, baseIndex + 3
                            );
                        }
                    }
                }
            }
        }
        
        // Crear meshes para bloques opacos
        for (const [type, data] of geometryData) {
            if (data.positions.length === 0) continue;
            
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
            geometry.setIndex(data.indices);
            
            const mesh = new THREE.Mesh(geometry, this.materials[type]);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            
            chunk.mesh.add(mesh);
        }
        
        // Crear meshes para bloques transparentes (se renderizan después)
        for (const [type, data] of transparentGeometryData) {
            if (data.positions.length === 0) continue;
            
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
            geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
            geometry.setIndex(data.indices);
            
            const mesh = new THREE.Mesh(geometry, this.materials[type]);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            mesh.renderOrder = 1; // Renderizar después de opacos
            
            chunk.mesh.add(mesh);
        }
        
        chunk.isDirty = false;
    }

    // Verificar si un bloque está expuesto
    isBlockExposed(chunk, x, y, z) {
        const directions = [
            [1, 0, 0], [-1, 0, 0],
            [0, 1, 0], [0, -1, 0],
            [0, 0, 1], [0, 0, -1]
        ];
        
        const currentType = chunk.data.getBlock(x, y, z);
        const isTransparent = this.blockTypes[currentType] && 
                            this.blockTypes[currentType].transparent;
        
        for (let [dx, dy, dz] of directions) {
            const nx = x + dx;
            const ny = y + dy;
            const nz = z + dz;
            
            // Si está en el borde del chunk, asumimos que está expuesto
            if (nx < 0 || nx >= this.chunkSize || 
                ny < 0 || ny >= this.chunkHeight || 
                nz < 0 || nz >= this.chunkSize) {
                return true;
            }
            
            // Si el bloque adyacente es aire, está expuesto
            const adjacentType = chunk.data.getBlock(nx, ny, nz);
            if (adjacentType === 0) {
                return true;
            }
            
            // Si el bloque actual es opaco y el adyacente es transparente, está expuesto
            if (!isTransparent && this.blockTypes[adjacentType] && 
                this.blockTypes[adjacentType].transparent) {
                return true;
            }
        }
        
        return false;
    }

    // Sistema de actualización de chunks
    updateChunks(playerX, playerZ) {
        const playerChunkX = Math.floor(playerX / this.chunkSize);
        const playerChunkZ = Math.floor(playerZ / this.chunkSize);
        
        // Actualizar velocidad
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastUpdateTime) / 1000;
        
        if (deltaTime > 0 && this.lastPlayerPos.x !== null) {
            this.playerVelocity.x = (playerX - this.lastPlayerPos.x) / deltaTime;
            this.playerVelocity.z = (playerZ - this.lastPlayerPos.z) / deltaTime;
        }
        
        this.lastPlayerPos.x = playerX;
        this.lastPlayerPos.z = playerZ;
        this.lastUpdateTime = currentTime;
        
        // Cargar chunks necesarios
        for (let dx = -this.renderDistance; dx <= this.renderDistance; dx++) {
            for (let dz = -this.renderDistance; dz <= this.renderDistance; dz++) {
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                const key = `${chunkX},${chunkZ}`;
                
                if (!this.chunks.has(key)) {
                    // Agregar a la cola de generación
                    this.queueChunkGeneration(chunkX, chunkZ);
                }
            }
        }
        
        // Mantener chunks de colisión en un radio mayor
        const collisionRadius = this.renderDistance + 2;
        for (let dx = -collisionRadius; dx <= collisionRadius; dx++) {
            for (let dz = -collisionRadius; dz <= collisionRadius; dz++) {
                const chunkX = playerChunkX + dx;
                const chunkZ = playerChunkZ + dz;
                const key = `${chunkX},${chunkZ}`;
                
                if (!this.collisionChunks.has(key)) {
                    // Generar datos de colisión si no existen
                    const chunk = this.chunks.get(key);
                    if (chunk) {
                        this.collisionChunks.set(key, chunk.data);
                    }
                }
            }
        }
        
        // Descargar chunks lejanos
        const unloadDistance = this.renderDistance + 3;
        const toRemove = [];
        
        for (const [key, chunk] of this.chunks) {
            const [cx, cz] = key.split(',').map(Number);
            const dx = cx - playerChunkX;
            const dz = cz - playerChunkZ;
            
            if (Math.abs(dx) > unloadDistance || Math.abs(dz) > unloadDistance) {
                toRemove.push(key);
            }
        }
        
        // Remover chunks lejanos
        for (const key of toRemove) {
            const chunk = this.chunks.get(key);
            if (chunk && chunk.mesh) {
                window.game.scene.remove(chunk.mesh);
                chunk.mesh.traverse((child) => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => m.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                });
            }
            this.chunks.delete(key);
        }
        
        // Limpiar chunks de colisión muy lejanos
        const collisionUnloadDistance = collisionRadius + 3;
        const collisionToRemove = [];
        
        for (const [key] of this.collisionChunks) {
            const [cx, cz] = key.split(',').map(Number);
            const dx = cx - playerChunkX;
            const dz = cz - playerChunkZ;
            
            if (Math.abs(dx) > collisionUnloadDistance || Math.abs(dz) > collisionUnloadDistance) {
                collisionToRemove.push(key);
            }
        }
        
        for (const key of collisionToRemove) {
            this.collisionChunks.delete(key);
        }
        
        // NUEVO: Limpiar cache de árboles pendientes muy lejanos
        const pendingTreesToRemove = [];
        for (const [key] of this.pendingTreesCache) {
            const [cx, cz] = key.split(',').map(Number);
            const dx = cx - playerChunkX;
            const dz = cz - playerChunkZ;
            
            if (Math.abs(dx) > unloadDistance + 2 || Math.abs(dz) > unloadDistance + 2) {
                pendingTreesToRemove.push(key);
            }
        }
        
        for (const key of pendingTreesToRemove) {
            this.pendingTreesCache.delete(key);
        }
        
        // Actualizar contador
        this.updateBlockCount();
        
        return this.chunks.size;
    }
    
    // Agregar chunk a la cola de generación
    queueChunkGeneration(chunkX, chunkZ) {
        const key = `${chunkX},${chunkZ}`;
        
        // Verificar si ya está en cola
        if (this.generationQueue.some(task => task.key === key)) {
            return;
        }
        
        // Calcular prioridad
        const dx = chunkX - Math.floor(this.lastPlayerPos.x / this.chunkSize);
        const dz = chunkZ - Math.floor(this.lastPlayerPos.z / this.chunkSize);
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        this.generationQueue.push({
            x: chunkX,
            z: chunkZ,
            key: key,
            priority: distance
        });
        
        // Ordenar por prioridad
        this.generationQueue.sort((a, b) => a.priority - b.priority);
    }
    
    // Procesar cola de generación
    async processGenerationQueue() {
        if (this.isGenerating || this.generationQueue.length === 0) return;
        
        this.isGenerating = true;
        const startTime = performance.now();
        const maxTime = 10; // 10ms máximo por frame
        
        while (this.generationQueue.length > 0 && performance.now() - startTime < maxTime) {
            const task = this.generationQueue.shift();
            
            // Intentar generar con Web Worker si está disponible
            if (this.worker && !this.workerBusy) {
                this.generateChunkWithWorker(task.x, task.z);
            } else {
                // Generar chunk de forma tradicional
                const chunk = this.generateChunk(task.x, task.z);
                
                // Construir mesh
                this.buildChunkMesh(chunk);
                
                // Agregar a la escena
                if (chunk.mesh) {
                    window.game.scene.add(chunk.mesh);
                }
                
                // Guardar chunk
                this.chunks.set(task.key, chunk);
                
                // Guardar datos de colisión
                this.collisionChunks.set(task.key, chunk.data);
            }
        }
        
        this.isGenerating = false;
    }
    
    // Iniciar procesamiento continuo
    startProcessing() {
        const process = () => {
            if (window.game && !window.game.isPaused) {
                this.processGenerationQueue();
            }
            requestAnimationFrame(process);
        };
        requestAnimationFrame(process);
    }
    
    // Update block count
    updateBlockCount() {
        if (!window.game) return;
        
        window.game.blockCount = 0;
        this.chunks.forEach(c => {
            if (c && c.data && c.data.blockCount) {
                window.game.blockCount += c.data.blockCount;
            }
        });
    }

    // Update render distance
    setRenderDistance(newDistance) {
        this.renderDistance = Math.max(1, Math.min(10, newDistance));
        
        // Force chunk update
        if (window.game && window.game.player) {
            this.updateChunks(window.game.player.position.x, window.game.player.position.z);
        }
    }

    // Obtener bloque para física
    getBlock(x, y, z) {
        const chunkKey = this.getChunkKey(x, z);
        
        // Primero intentar con chunks de colisión
        let chunkData = this.collisionChunks.get(chunkKey);
        
        // Si no existe en colisiones, buscar en chunks renderizados
        if (!chunkData) {
            const chunk = this.chunks.get(chunkKey);
            if (chunk && chunk.data) {
                chunkData = chunk.data;
                // Agregar a colisiones para futuras consultas
                this.collisionChunks.set(chunkKey, chunkData);
            }
        }
        
        // Si aún no existe, generar síncronamente para evitar caídas
        if (!chunkData) {
            const [cx, cz] = chunkKey.split(',').map(Number);
            console.warn(`[ChunkManager] Generación síncrona de emergencia para chunk ${cx},${cz}`);
            
            const chunk = this.generateChunk(cx, cz);
            this.collisionChunks.set(chunkKey, chunk.data);
            chunkData = chunk.data;
        }
        
        if (chunkData) {
            const localX = ((x % this.chunkSize) + this.chunkSize) % this.chunkSize;
            const localZ = ((z % this.chunkSize) + this.chunkSize) % this.chunkSize;
            
            return chunkData.getBlock(Math.floor(localX), Math.floor(y), Math.floor(localZ));
        }
        
        return 0;
    }

    setBlock(x, y, z, type) {
        const chunkKey = this.getChunkKey(x, z);
        const chunk = this.chunks.get(chunkKey);
        
        if (chunk && chunk.data) {
            const localX = ((x % this.chunkSize) + this.chunkSize) % this.chunkSize;
            const localZ = ((z % this.chunkSize) + this.chunkSize) % this.chunkSize;
            
            const changed = chunk.data.setBlock(Math.floor(localX), Math.floor(y), Math.floor(localZ), type);
            
            if (changed) {
                // Record change in persistence system
                if (this.blockPersistence) {
                    this.blockPersistence.recordBlockChange(
                        Math.floor(x), 
                        Math.floor(y), 
                        Math.floor(z), 
                        type, 
                        this.chunkSize
                    );
                }
                
                chunk.isDirty = true;
                
                // Reconstruir mesh
                this.buildChunkMesh(chunk);
                
                // Update adjacent chunks if necessary
                if (localX === 0 || localX === this.chunkSize - 1 || 
                    localZ === 0 || localZ === this.chunkSize - 1) {
                    this.updateAdjacentChunks(x, z);
                }
            }
        }
    }

    updateAdjacentChunks(x, z) {
        const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        
        directions.forEach(([dx, dz]) => {
            const adjacentKey = this.getChunkKey(x + dx * this.chunkSize, z + dz * this.chunkSize);
            const adjacentChunk = this.chunks.get(adjacentKey);
            
            if (adjacentChunk && !adjacentChunk.isDirty) {
                adjacentChunk.isDirty = true;
                this.buildChunkMesh(adjacentChunk);
            }
        });
    }

    // Get biome at position for HUD
    getBiomeAt(x, y, z) {
        return this.biomeProvider.getBiome3D(x, y, z);
    }
}

// Chunk debug logging class
class ChunkDebugLogger {
    constructor() {
        this.isLogging = false;
        this.logs = [];
        this.startTime = 0;
        this.maxLogs = 10000;
    }
    
    startLogging() {
        this.isLogging = true;
        this.logs = [];
        this.startTime = performance.now();
        this.log('=== CHUNK DEBUG LOGGING STARTED ===');
    }
    
    stopLogging() {
        this.log('=== CHUNK DEBUG LOGGING STOPPED ===');
        this.log(`Total logging time: ${(performance.now() - this.startTime).toFixed(2)}ms`);
        this.isLogging = false;
        return this.exportLogs();
    }
    
    log(message, data = null) {
        if (!this.isLogging || this.logs.length >= this.maxLogs) return;
        
        const timestamp = (performance.now() - this.startTime).toFixed(2);
        const entry = {
            timestamp,
            message,
            data: data ? JSON.stringify(data) : null
        };
        
        this.logs.push(entry);
    }
    
    logChunkGeneration(x, z, phase, data = null) {
        this.log(`Chunk[${x},${z}] Generation ${phase}`, data);
    }
    
    logMeshBuilding(x, z, phase, data = null) {
        this.log(`Chunk[${x},${z}] Mesh Building ${phase}`, data);
    }
    
    logChunkUpdate(phase, data = null) {
        this.log(`Chunk Update ${phase}`, data);
    }
    
    exportLogs() {
        const logText = this.logs.map(entry => {
            let line = `[${entry.timestamp}ms] ${entry.message}`;
            if (entry.data) {
                line += `\n  Data: ${entry.data}`;
            }
            return line;
        }).join('\n');
        
        return logText;
    }
}