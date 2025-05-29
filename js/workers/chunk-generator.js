// chunk-generator.js - Web Worker para generación de chunks en segundo plano
// Esto elimina el lag al generar nuevos chunks

// Importar SimplexNoise
importScripts('/js/libs/simplex-noise.min.js');

// Constantes necesarias (copiadas de Constants.js)
const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 128;
const WATER_LEVEL = 8;

// Parámetros de generación 3D
const GENERATION_3D = {
    NOISE_SCALES: {
        primary: 0.008,
        secondary: 0.015,
        detail: 0.03,
        cave: 0.02
    },
    NOISE_AMPLITUDES: {
        primary: 1.0,
        secondary: 0.5,
        detail: 0.25,
        cave: 1.0
    },
    DENSITY_THRESHOLD: 0.0
};

// Biomas simplificados para el worker
const BIOMES = {
    plains: {
        baseHeight: 45,
        heightVariation: 5,
        densityModifier: 1.0,
        surfaceBlock: 2,
        subsurfaceBlock: 1,
        caveThreshold: 0.6
    },
    mountains: {
        baseHeight: 75,
        heightVariation: 35,
        densityModifier: 1.4,
        surfaceBlock: 3,
        subsurfaceBlock: 3,
        caveThreshold: 0.7
    },
    desert: {
        baseHeight: 42,
        heightVariation: 8,
        densityModifier: 0.95,
        surfaceBlock: 6,
        subsurfaceBlock: 6,
        caveThreshold: 0.65
    }
};

// Variables globales del worker
let noise = null;
let seed = 0;

// Función para calcular densidad 3D
function calculateDensity(worldX, worldY, worldZ) {
    // Obtener bioma simplificado (sin el sistema completo)
    const biomeNoise = noise.noise2D(worldX * 0.001, worldZ * 0.001);
    let biomeData;
    
    if (biomeNoise < -0.3) {
        biomeData = BIOMES.desert;
    } else if (biomeNoise > 0.3) {
        biomeData = BIOMES.mountains;
    } else {
        biomeData = BIOMES.plains;
    }
    
    // Base density with biome height
    let density = biomeData.baseHeight - worldY;
    density *= biomeData.densityModifier;
    
    // Primary 3D noise (large forms)
    const primaryNoise = noise.noise3D(
        worldX * GENERATION_3D.NOISE_SCALES.primary,
        worldY * GENERATION_3D.NOISE_SCALES.primary * 0.5,
        worldZ * GENERATION_3D.NOISE_SCALES.primary
    );
    
    // Secondary 3D noise (medium variations)
    const secondaryNoise = noise.noise3D(
        worldX * GENERATION_3D.NOISE_SCALES.secondary + 100,
        worldY * GENERATION_3D.NOISE_SCALES.secondary * 0.5 + 100,
        worldZ * GENERATION_3D.NOISE_SCALES.secondary + 100
    );
    
    // Detail 3D noise (small variations)
    const detailNoise = noise.noise3D(
        worldX * GENERATION_3D.NOISE_SCALES.detail + 200,
        worldY * GENERATION_3D.NOISE_SCALES.detail * 0.5 + 200,
        worldZ * GENERATION_3D.NOISE_SCALES.detail + 200
    );
    
    // Apply noise with amplitudes
    const heightVar = biomeData.heightVariation;
    density += primaryNoise * GENERATION_3D.NOISE_AMPLITUDES.primary * heightVar;
    density += secondaryNoise * GENERATION_3D.NOISE_AMPLITUDES.secondary * heightVar * 0.5;
    density += detailNoise * GENERATION_3D.NOISE_AMPLITUDES.detail * heightVar * 0.25;
    
    // 3D caves only underground
    if (worldY < biomeData.baseHeight - 5) {
        const caveNoise = noise.noise3D(
            worldX * GENERATION_3D.NOISE_SCALES.cave,
            worldY * GENERATION_3D.NOISE_SCALES.cave,
            worldZ * GENERATION_3D.NOISE_SCALES.cave
        );
        
        const caveNoise2 = noise.noise3D(
            worldX * GENERATION_3D.NOISE_SCALES.cave * 2 + 1000,
            worldY * GENERATION_3D.NOISE_SCALES.cave * 2 + 1000,
            worldZ * GENERATION_3D.NOISE_SCALES.cave * 2 + 1000
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
    
    return { density, biomeData };
}

// Función principal de generación
function generateChunk(chunkX, chunkZ) {
    const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
    const surfaceMap = [];
    
    for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
            const worldX = chunkX * CHUNK_SIZE + x;
            const worldZ = chunkZ * CHUNK_SIZE + z;
            
            let surfaceY = -1;
            let surfaceBiome = null;
            
            // Generar columna
            for (let y = 0; y < CHUNK_HEIGHT; y++) {
                const { density, biomeData } = calculateDensity(worldX, y, worldZ);
                
                if (density > GENERATION_3D.DENSITY_THRESHOLD) {
                    const index = x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
                    blocks[index] = 3; // Piedra
                    surfaceY = y;
                    surfaceBiome = biomeData;
                }
            }
            
            // Aplicar superficie
            if (surfaceY > -1 && surfaceBiome) {
                // Superficie
                const surfaceIndex = x + z * CHUNK_SIZE + surfaceY * CHUNK_SIZE * CHUNK_SIZE;
                blocks[surfaceIndex] = surfaceBiome.surfaceBlock;
                
                // Subsuperficie
                for (let y = surfaceY - 1; y >= Math.max(0, surfaceY - 3); y--) {
                    const index = x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
                    if (blocks[index] === 3) {
                        blocks[index] = surfaceBiome.subsurfaceBlock;
                    }
                }
                
                // Guardar info de superficie para vegetación
                surfaceMap.push({
                    x: x,
                    z: z,
                    y: surfaceY,
                    biome: surfaceBiome
                });
            }
        }
    }
    
    return { blocks, surfaceMap };
}

// Manejar mensajes del hilo principal
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    switch (type) {
        case 'init':
            // Inicializar con semilla
            seed = data.seed;
            noise = new SimplexNoise(seed);
            self.postMessage({ type: 'ready' });
            break;
            
        case 'generate':
            // Generar chunk
            const { chunkX, chunkZ } = data;
            const startTime = performance.now();
            
            try {
                const { blocks, surfaceMap } = generateChunk(chunkX, chunkZ);
                
                // Enviar resultado
                self.postMessage({
                    type: 'chunk',
                    data: {
                        chunkX: chunkX,
                        chunkZ: chunkZ,
                        blocks: blocks.buffer,
                        surfaceMap: surfaceMap,
                        generationTime: performance.now() - startTime
                    }
                }, [blocks.buffer]); // Transferir ownership para mejor rendimiento
                
            } catch (error) {
                self.postMessage({
                    type: 'error',
                    data: {
                        chunkX: chunkX,
                        chunkZ: chunkZ,
                        error: error.message
                    }
                });
            }
            break;
    }
};

// Notificar que el worker está listo
self.postMessage({ type: 'loaded' });
