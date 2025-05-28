// Sistema principal de árboles optimizado para voxel engine
class TreeSystem {
    constructor(seed) {
        this.seed = seed;
        this.treeNoise = new SimplexNoise(seed + 1337);
        this.densityNoise = new SimplexNoise(seed + 2674);
        this.treeTypes = new Map();
        this.treeStructureCache = new Map();
        
        // Inicializar tipos de árboles
        this.initializeTreeTypes();
        
        console.log('[TreeSystem] Initialized with seed:', seed);
    }
    
    initializeTreeTypes() {
        // Roble - Árbol clásico de Minecraft
        this.treeTypes.set('oak', {
            name: 'Roble',
            minHeight: 5,
            maxHeight: 7,
            trunkBlock: 4,  // Madera
            leafBlock: 14,  // Nuevo tipo de bloque para hojas
            canopyShape: 'spherical',
            canopyRadius: 2,
            canopyHeight: 3,
            biomes: ['plains', 'forest', 'highlands'],
            spawnChance: 0.08, // Aumentado para más árboles
            minSpacing: 4
        });
        
        // Pino - Para montañas y zonas frías
        this.treeTypes.set('pine', {
            name: 'Pino',
            minHeight: 7,
            maxHeight: 11,
            trunkBlock: 15,  // Madera de pino
            leafBlock: 16,   // Hojas de pino
            canopyShape: 'conical',
            canopyRadius: 3,
            canopyHeight: 6,
            biomes: ['snowy_mountains', 'mountains', 'frozen_peaks'],
            spawnChance: 0.06,
            minSpacing: 3
        });
        
        // Abedul - Árbol alto y delgado
        this.treeTypes.set('birch', {
            name: 'Abedul',
            minHeight: 6,
            maxHeight: 8,
            trunkBlock: 17,  // Madera de abedul
            leafBlock: 18,   // Hojas de abedul
            canopyShape: 'ellipsoid',
            canopyRadius: 2,
            canopyHeight: 4,
            biomes: ['forest', 'plains'],
            spawnChance: 0.05,
            minSpacing: 4
        });
        
        // Árbol de la jungla - Grande y majestuoso
        this.treeTypes.set('jungle', {
            name: 'Árbol de Jungla',
            minHeight: 12,
            maxHeight: 20,
            trunkBlock: 19,  // Madera de jungla
            leafBlock: 20,   // Hojas de jungla
            canopyShape: 'layered',
            canopyRadius: 4,
            canopyHeight: 8,
            trunkRadius: 2,  // Tronco más grueso
            biomes: ['jungle'],
            spawnChance: 0.1,
            minSpacing: 6,
            hasVines: true
        });
        
        // Acacia - Árbol de sabana
        this.treeTypes.set('acacia', {
            name: 'Acacia',
            minHeight: 5,
            maxHeight: 7,
            trunkBlock: 21,  // Madera de acacia
            leafBlock: 22,   // Hojas de acacia
            canopyShape: 'flat_top',
            canopyRadius: 3,
            canopyHeight: 2,
            biomes: ['savanna'],
            spawnChance: 0.05,
            minSpacing: 5,
            hasBranches: true
        });
        
        // Cactus - Para desiertos
        this.treeTypes.set('cactus', {
            name: 'Cactus',
            minHeight: 2,
            maxHeight: 5,
            trunkBlock: 23,  // Bloque de cactus
            leafBlock: 0,    // Sin hojas
            canopyShape: 'none',
            canopyRadius: 0,
            canopyHeight: 0,
            biomes: ['desert'],
            spawnChance: 0.02,
            minSpacing: 3
        });
        
        console.log('[TreeSystem] Initialized', this.treeTypes.size, 'tree types');
    }
    
    // Determinar si debe generarse un árbol en esta posición
    shouldSpawnTree(worldX, worldZ, biomeId, existingTrees = []) {
        // Verificar espaciado mínimo con otros árboles
        for (const tree of existingTrees) {
            const dx = worldX - tree.x;
            const dz = worldZ - tree.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance < 4) { // Espaciado mínimo global
                return false;
            }
        }
        
        // Obtener tipo de árbol para el bioma
        const treeType = this.getTreeTypeForBiome(biomeId);
        if (!treeType) {
            return false;
        }
        
        // Usar ruido para distribución natural
        const noiseValue = this.treeNoise.noise2D(worldX * 0.1, worldZ * 0.1);
        const densityValue = this.densityNoise.noise2D(worldX * 0.05, worldZ * 0.05);
        
        // Combinar ruidos para variación
        const combinedNoise = (noiseValue + 1) * 0.5 * (densityValue + 1) * 0.5;
        
        // Verificar contra chance de spawn
        const spawnThreshold = 1 - treeType.type.spawnChance;
        
        return combinedNoise > spawnThreshold;
    }
    
    // Obtener tipo de árbol apropiado para el bioma
    getTreeTypeForBiome(biomeId) {
        const validTypes = [];
        
        for (const [typeName, treeType] of this.treeTypes) {
            if (treeType.biomes.includes(biomeId)) {
                validTypes.push({ name: typeName, type: treeType });
            }
        }
        
        if (validTypes.length === 0) {
            return null;
        }
        
        // Seleccionar aleatoriamente basado en el ruido
        const selection = Math.abs(this.treeNoise.noise2D(biomeId * 100, 0)) * validTypes.length;
        return validTypes[Math.floor(selection) % validTypes.length];
    }
    
    // Generar estructura de árbol
    generateTree(x, y, z, treeTypeName) {
        const treeType = this.treeTypes.get(treeTypeName);
        if (!treeType) {
            console.warn('[TreeSystem] Unknown tree type:', treeTypeName);
            return [];
        }
        
        const blocks = [];
        
        // Calcular altura con variación
        const heightVariation = this.treeNoise.noise2D(x * 0.1, z * 0.1);
        const height = Math.floor(
            treeType.minHeight + 
            (treeType.maxHeight - treeType.minHeight) * ((heightVariation + 1) * 0.5)
        );
        
        // Generar tronco
        const trunkRadius = treeType.trunkRadius || 1;
        for (let h = 0; h < height; h++) {
            if (trunkRadius === 1) {
                // Tronco simple
                blocks.push({
                    x: x, 
                    y: y + h, 
                    z: z,
                    type: treeType.trunkBlock
                });
            } else {
                // Tronco grueso (para árboles de jungla)
                for (let dx = 0; dx < trunkRadius; dx++) {
                    for (let dz = 0; dz < trunkRadius; dz++) {
                        blocks.push({
                            x: x + dx, 
                            y: y + h, 
                            z: z + dz,
                            type: treeType.trunkBlock
                        });
                    }
                }
            }
        }
        
        // Generar ramas si el árbol las tiene
        if (treeType.hasBranches) {
            this.generateBranches(blocks, x, y + height - 2, z, treeType);
        }
        
        // Generar copa según el tipo
        const canopyY = y + height - 1;
        switch (treeType.canopyShape) {
            case 'spherical':
                this.generateSphericalCanopy(blocks, x, canopyY, z, treeType);
                break;
            case 'conical':
                this.generateConicalCanopy(blocks, x, canopyY, z, treeType);
                break;
            case 'ellipsoid':
                this.generateEllipsoidCanopy(blocks, x, canopyY, z, treeType);
                break;
            case 'layered':
                this.generateLayeredCanopy(blocks, x, canopyY, z, treeType);
                break;
            case 'flat_top':
                this.generateFlatTopCanopy(blocks, x, canopyY, z, treeType);
                break;
            case 'none':
                // Sin copa (cactus)
                break;
        }
        
        // Agregar vides si corresponde
        if (treeType.hasVines) {
            this.generateVines(blocks, x, y, z, height, treeType);
        }
        
        return blocks;
    }
    
    // Generar copa esférica (roble)
    generateSphericalCanopy(blocks, x, y, z, treeType) {
        const radius = treeType.canopyRadius;
        const centerY = y + Math.floor(treeType.canopyHeight / 2);
        
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    
                    if (distance <= radius) {
                        // Densidad basada en la distancia del centro
                        const density = 1 - (distance / radius);
                        
                        // Evitar hojas en el centro del tronco
                        if (Math.abs(dx) + Math.abs(dz) > 0 || dy > 0) {
                            if (Math.random() < density * 0.9) {
                                blocks.push({
                                    x: x + dx,
                                    y: centerY + dy,
                                    z: z + dz,
                                    type: treeType.leafBlock
                                });
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Generar copa cónica (pino)
    generateConicalCanopy(blocks, x, y, z, treeType) {
        const maxRadius = treeType.canopyRadius;
        const height = treeType.canopyHeight;
        
        for (let h = 0; h < height; h++) {
            // Radio disminuye con la altura
            const radius = Math.floor(maxRadius * (1 - h / height));
            
            for (let dx = -radius; dx <= radius; dx++) {
                for (let dz = -radius; dz <= radius; dz++) {
                    const distance = Math.sqrt(dx*dx + dz*dz);
                    
                    if (distance <= radius) {
                        // Mayor densidad en el exterior
                        const density = 0.8 + (distance / radius) * 0.2;
                        
                        if (Math.random() < density) {
                            blocks.push({
                                x: x + dx,
                                y: y + h,
                                z: z + dz,
                                type: treeType.leafBlock
                            });
                        }
                    }
                }
            }
        }
    }
    
    // Generar copa elipsoide (abedul)
    generateEllipsoidCanopy(blocks, x, y, z, treeType) {
        const radiusH = treeType.canopyRadius;
        const radiusV = treeType.canopyHeight / 2;
        const centerY = y + radiusV;
        
        for (let dy = -radiusV; dy <= radiusV; dy++) {
            const yFactor = 1 - (dy * dy) / (radiusV * radiusV);
            const currentRadius = radiusH * Math.sqrt(yFactor);
            
            for (let dx = -radiusH; dx <= radiusH; dx++) {
                for (let dz = -radiusH; dz <= radiusH; dz++) {
                    const distance = Math.sqrt(dx*dx + dz*dz);
                    
                    if (distance <= currentRadius) {
                        if (Math.random() < 0.85) {
                            blocks.push({
                                x: x + dx,
                                y: Math.floor(centerY + dy),
                                z: z + dz,
                                type: treeType.leafBlock
                            });
                        }
                    }
                }
            }
        }
    }
    
    // Generar copa en capas (jungla)
    generateLayeredCanopy(blocks, x, y, z, treeType) {
        const layers = [
            { radius: 2, height: 0 },
            { radius: 3, height: 1 },
            { radius: 4, height: 2 },
            { radius: 4, height: 3 },
            { radius: 3, height: 4 },
            { radius: 2, height: 5 },
            { radius: 1, height: 6 }
        ];
        
        for (const layer of layers) {
            if (layer.height >= treeType.canopyHeight) break;
            
            for (let dx = -layer.radius; dx <= layer.radius; dx++) {
                for (let dz = -layer.radius; dz <= layer.radius; dz++) {
                    const distance = Math.abs(dx) + Math.abs(dz);
                    
                    // Forma de diamante
                    if (distance <= layer.radius) {
                        if (Math.random() < 0.9) {
                            blocks.push({
                                x: x + dx,
                                y: y + layer.height,
                                z: z + dz,
                                type: treeType.leafBlock
                            });
                        }
                    }
                }
            }
        }
    }
    
    // Generar copa plana (acacia)
    generateFlatTopCanopy(blocks, x, y, z, treeType) {
        const radius = treeType.canopyRadius;
        
        // Capa principal plana
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dz = -radius; dz <= radius; dz++) {
                const distance = Math.sqrt(dx*dx + dz*dz);
                
                if (distance <= radius) {
                    blocks.push({
                        x: x + dx,
                        y: y + 1,
                        z: z + dz,
                        type: treeType.leafBlock
                    });
                    
                    // Capa superior más pequeña
                    if (distance <= radius - 1) {
                        blocks.push({
                            x: x + dx,
                            y: y + 2,
                            z: z + dz,
                            type: treeType.leafBlock
                        });
                    }
                }
            }
        }
    }
    
    // Generar ramas (para acacia)
    generateBranches(blocks, x, y, z, treeType) {
        const branchCount = 2 + Math.floor(Math.random() * 2);
        
        for (let i = 0; i < branchCount; i++) {
            const angle = (i / branchCount) * Math.PI * 2;
            const length = 2 + Math.floor(Math.random() * 2);
            
            for (let l = 1; l <= length; l++) {
                const dx = Math.round(Math.cos(angle) * l);
                const dz = Math.round(Math.sin(angle) * l);
                const dy = Math.floor(l * 0.5);
                
                blocks.push({
                    x: x + dx,
                    y: y + dy,
                    z: z + dz,
                    type: treeType.trunkBlock
                });
            }
        }
    }
    
    // Generar vides (para jungla)
    generateVines(blocks, x, y, z, height, treeType) {
        const vineBlock = 24; // Nuevo tipo de bloque para vides
        
        // Agregar vides colgando de las hojas
        const leafBlocks = blocks.filter(b => b.type === treeType.leafBlock);
        
        for (const leaf of leafBlocks) {
            if (Math.random() < 0.3) { // 30% de probabilidad
                const vineLength = 1 + Math.floor(Math.random() * 4);
                
                for (let v = 1; v <= vineLength; v++) {
                    const vineY = leaf.y - v;
                    
                    // Verificar que no choque con otros bloques
                    const collision = blocks.some(b => 
                        b.x === leaf.x && 
                        b.y === vineY && 
                        b.z === leaf.z
                    );
                    
                    if (!collision && vineY > y) {
                        blocks.push({
                            x: leaf.x,
                            y: vineY,
                            z: leaf.z,
                            type: vineBlock
                        });
                    } else {
                        break;
                    }
                }
            }
        }
    }
}

// Exportar para uso global
window.TreeSystem = TreeSystem;