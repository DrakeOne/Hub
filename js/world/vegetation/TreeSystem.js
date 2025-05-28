// Sistema principal de árboles optimizado con distribución mejorada
class TreeSystem {
    constructor(seed) {
        this.seed = seed;
        this.treeNoise = new SimplexNoise(seed + 1337);
        this.densityNoise = new SimplexNoise(seed + 2674);
        this.variationNoise = new SimplexNoise(seed + 3891);
        this.clusterNoise = new SimplexNoise(seed + 4567);
        
        // Inicializar generador de árboles
        this.treeGenerator = new TreeGenerator();
        
        // Configuración de biomas y densidades
        this.biomeTreeConfig = {
            plains: {
                trees: ['oak', 'oak', 'oak', 'birch'], // 75% roble, 25% abedul
                density: 0.15, // 15% de cobertura
                clustering: 0.3, // Tendencia a agruparse
                minSpacing: 2
            },
            forest: {
                trees: ['oak', 'oak', 'birch', 'dark_oak', 'dark_oak'],
                density: 0.45, // 45% de cobertura - bosque denso
                clustering: 0.6,
                minSpacing: 2
            },
            birch_forest: {
                trees: ['birch', 'birch', 'birch', 'oak'],
                density: 0.35,
                clustering: 0.4,
                minSpacing: 2
            },
            dark_forest: {
                trees: ['dark_oak', 'dark_oak', 'dark_oak', 'oak'],
                density: 0.55, // Muy denso
                clustering: 0.7,
                minSpacing: 2
            },
            savanna: {
                trees: ['acacia', 'acacia', 'acacia'],
                density: 0.08,
                clustering: 0.2,
                minSpacing: 4
            },
            jungle: {
                trees: ['jungle', 'jungle', 'jungle', 'jungle'],
                density: 0.65, // Extremadamente denso
                clustering: 0.8,
                minSpacing: 1,
                hasUndergrowth: true
            },
            snowy_mountains: {
                trees: ['spruce', 'spruce', 'spruce'],
                density: 0.25,
                clustering: 0.5,
                minSpacing: 2
            },
            mountains: {
                trees: ['spruce', 'spruce', 'oak'],
                density: 0.20,
                clustering: 0.4,
                minSpacing: 3
            },
            frozen_peaks: {
                trees: ['spruce'],
                density: 0.10,
                clustering: 0.3,
                minSpacing: 3
            },
            highlands: {
                trees: ['oak', 'spruce'],
                density: 0.15,
                clustering: 0.3,
                minSpacing: 3
            },
            desert: {
                trees: ['cactus'],
                density: 0.02,
                clustering: 0.1,
                minSpacing: 3,
                isCactus: true
            }
        };
        
        console.log('[TreeSystem] Initialized with TreeGenerator');
    }
    
    // Determinar si debe generarse un árbol en esta posición
    shouldSpawnTree(worldX, worldZ, biomeId, existingTrees = []) {
        const config = this.biomeTreeConfig[biomeId];
        if (!config || !config.trees || config.trees.length === 0) {
            return false;
        }
        
        // Verificar espaciado mínimo
        for (const tree of existingTrees) {
            const dx = worldX - tree.x;
            const dz = worldZ - tree.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance < config.minSpacing) {
                return false;
            }
        }
        
        // Sistema de densidad mejorado con clustering
        const scale1 = 0.02;  // Escala grande para patrones generales
        const scale2 = 0.05;  // Escala media para variación
        const scale3 = 0.1;   // Escala pequeña para detalles
        const clusterScale = 0.008; // Escala para agrupaciones
        
        // Ruido de densidad base
        const baseNoise = (this.treeNoise.noise2D(worldX * scale1, worldZ * scale1) + 1) * 0.5;
        const mediumNoise = (this.densityNoise.noise2D(worldX * scale2, worldZ * scale2) + 1) * 0.5;
        const detailNoise = (this.variationNoise.noise2D(worldX * scale3, worldZ * scale3) + 1) * 0.5;
        
        // Ruido de clustering - crea áreas con más o menos árboles
        const clusterValue = (this.clusterNoise.noise2D(worldX * clusterScale, worldZ * clusterScale) + 1) * 0.5;
        
        // Combinar ruidos
        let combinedNoise = baseNoise * 0.4 + mediumNoise * 0.3 + detailNoise * 0.3;
        
        // Aplicar clustering
        if (clusterValue > 0.5) {
            // Área de bosque denso
            combinedNoise *= 1 + (clusterValue - 0.5) * config.clustering * 2;
        } else {
            // Área de claro
            combinedNoise *= 1 - (0.5 - clusterValue) * config.clustering;
        }
        
        // Ajustar threshold basado en la densidad del bioma
        const threshold = 1 - config.density;
        
        // Para junglas, agregar vegetación extra
        if (config.hasUndergrowth && combinedNoise > threshold * 0.7) {
            return true;
        }
        
        return combinedNoise > threshold;
    }
    
    // Obtener tipo de árbol para el bioma
    getTreeTypeForBiome(biomeId) {
        const config = this.biomeTreeConfig[biomeId];
        if (!config || !config.trees || config.trees.length === 0) {
            return null;
        }
        
        // Seleccionar tipo basado en ruido para variación natural
        const treeIndex = Math.floor(Math.abs(this.variationNoise.noise2D(biomeId.length * 10, 0)) * config.trees.length);
        const treeType = config.trees[treeIndex % config.trees.length];
        
        return {
            name: treeType,
            type: config
        };
    }
    
    // Generar árbol usando el TreeGenerator
    generateTree(x, y, z, treeTypeName) {
        // Generar seed único para este árbol
        const treeSeed = this.treeNoise.noise2D(x * 0.1, z * 0.1);
        
        // Usar el TreeGenerator para crear la estructura
        return this.treeGenerator.generateTree(x, y, z, treeTypeName, treeSeed);
    }
    
    // Generar cactus (caso especial)
    generateCactus(x, y, z) {
        const blocks = [];
        const height = 1 + Math.floor(Math.random() * 5);
        const cactusBlock = 23;
        
        // Tronco principal
        for (let h = 0; h < height; h++) {
            blocks.push({
                x: x,
                y: y + h,
                z: z,
                type: cactusBlock
            });
        }
        
        // Brazos ocasionales
        if (height > 3 && Math.random() > 0.5) {
            const armHeight = Math.floor(height * 0.6);
            const armDirection = Math.floor(Math.random() * 4);
            const dirs = [{x:1,z:0}, {x:-1,z:0}, {x:0,z:1}, {x:0,z:-1}];
            const dir = dirs[armDirection];
            
            // Brazo horizontal
            for (let i = 1; i <= 2; i++) {
                blocks.push({
                    x: x + dir.x * i,
                    y: y + armHeight,
                    z: z + dir.z * i,
                    type: cactusBlock
                });
            }
            
            // Brazo vertical
            const verticalLength = 2 + Math.floor(Math.random() * 2);
            for (let v = 1; v <= verticalLength; v++) {
                blocks.push({
                    x: x + dir.x * 2,
                    y: y + armHeight + v,
                    z: z + dir.z * 2,
                    type: cactusBlock
                });
            }
        }
        
        return blocks;
    }
    
    // Verificar si una posición es válida para un árbol
    isValidTreePosition(worldX, worldY, worldZ, chunkData) {
        // Verificar que hay espacio suficiente arriba
        const minClearanceHeight = 5;
        
        for (let h = 1; h <= minClearanceHeight; h++) {
            if (worldY + h >= 128) break; // Límite de altura
            
            // Aquí deberías verificar si hay bloques sólidos arriba
            // Por ahora asumimos que está libre
        }
        
        return true;
    }
    
    // Obtener configuración de densidad para debug
    getBiomeDensity(biomeId) {
        const config = this.biomeTreeConfig[biomeId];
        return config ? config.density : 0;
    }
}

// Exportar para uso global
window.TreeSystem = TreeSystem;