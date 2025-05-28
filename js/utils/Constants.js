// Constantes globales del juego
const CONSTANTS = {
    // Mundo
    CHUNK_SIZE: 16,
    CHUNK_HEIGHT: 128,
    RENDER_DISTANCE: 5, // Aumentado de 3 a 5 para mejor experiencia
    WATER_LEVEL: 8,
    
    // Física - Dimensiones exactas de Minecraft
    GRAVITY: 20.0,
    PLAYER_HEIGHT: 1.8,      // Altura exacta del jugador en Minecraft
    PLAYER_EYE_HEIGHT: 1.62, // Altura de los ojos: 1.62m desde la base
    PLAYER_RADIUS: 0.3,      // Radio del jugador: 0.6m de ancho/largo = 0.3m de radio
    
    // Movimiento
    MOVE_SPEED: 5.0,
    RUN_SPEED: 8.0,
    JUMP_SPEED: 7.0,
    FLY_SPEED: 15.0,
    FLY_SPEED_FAST: 30.0,
    
    // Controles
    MOUSE_SENSITIVITY: 0.002,
    TOUCH_SENSITIVITY: 0.003,
    DOUBLE_TAP_TIME: 300, // ms para detectar doble tap
    
    // Bloques - Tamaño estándar 1x1x1 metros
    BLOCK_SIZE: 1.0, // Tamaño de cada bloque: 1 metro
    BLOCK_TYPES: {
        0: null, // Aire
        1: { color: 0x8B4513, name: 'dirt' }, // Tierra
        2: { color: 0x228B22, name: 'grass' }, // Césped
        3: { color: 0x808080, name: 'stone' }, // Piedra
        4: { color: 0x654321, name: 'wood' }, // Madera
        5: { color: 0x00CED1, name: 'diamond' }, // Diamante
        6: { color: 0xFFD700, name: 'sand' }, // Arena
        7: { color: 0xFFFFFF, name: 'snow' }, // Nieve
        8: { color: 0x333333, name: 'deepslate' }, // Pizarra profunda
        9: { color: 0x00FF00, name: 'emerald' }, // Esmeralda
        10: { color: 0xFF0000, name: 'redstone' }, // Redstone
        11: { color: 0x4169E1, name: 'lapis' }, // Lapislázuli
        12: { color: 0xFFD700, name: 'gold' }, // Oro
        13: { color: 0xC0C0C0, name: 'iron' }, // Hierro
        
        // Bloques de árboles
        14: { color: 0x48C147, name: 'oak_leaves', transparent: true }, // Hojas de roble
        15: { color: 0x8B4513, name: 'pine_wood' }, // Madera de pino
        16: { color: 0x1B5E20, name: 'pine_leaves', transparent: true }, // Hojas de pino
        17: { color: 0xF5DEB3, name: 'birch_wood' }, // Madera de abedul
        18: { color: 0x80C147, name: 'birch_leaves', transparent: true }, // Hojas de abedul
        19: { color: 0x664228, name: 'jungle_wood' }, // Madera de jungla
        20: { color: 0x48C147, name: 'jungle_leaves', transparent: true }, // Hojas de jungla
        21: { color: 0xBA6337, name: 'acacia_wood' }, // Madera de acacia
        22: { color: 0x87A96B, name: 'acacia_leaves', transparent: true }, // Hojas de acacia
        23: { color: 0x5C7C3A, name: 'cactus' }, // Cactus
        24: { color: 0x48C147, name: 'vines', transparent: true } // Vides
    },
    
    // Sistema de biomas 3D
    BIOME_3D: {
        // Parámetros de ruido para biomas
        NOISE_PARAMS: {
            temperature: { scale: 0.0008, octaves: 4, persistence: 0.5, lacunarity: 2.0 },
            humidity: { scale: 0.0008, octaves: 4, persistence: 0.5, lacunarity: 2.0 },
            continentalness: { scale: 0.0004, octaves: 6, persistence: 0.6, lacunarity: 2.0 },
            erosion: { scale: 0.0006, octaves: 5, persistence: 0.55, lacunarity: 2.0 },
            peaks: { scale: 0.0005, octaves: 5, persistence: 0.5, lacunarity: 2.0 },
            weirdness: { scale: 0.001, octaves: 3, persistence: 0.4, lacunarity: 2.0 }
        },
        
        // Definiciones de biomas con rangos de valores
        BIOMES: {
            frozen_peaks: {
                name: 'Picos Helados',
                temperature: [-1, -0.5],
                humidity: [-1, 1],
                continentalness: [0.3, 1],
                erosion: [-1, -0.2],
                peaks: [0.5, 1],
                color: 0xFFFFFF,
                surfaceBlock: 7,
                subsurfaceBlock: 3,
                densityModifier: 1.5,
                baseHeight: 80,
                heightVariation: 40,
                caveThreshold: 0.8
            },
            snowy_mountains: {
                name: 'Montañas Nevadas',
                temperature: [-0.5, 0],
                humidity: [-0.5, 0.5],
                continentalness: [0.2, 0.8],
                erosion: [-0.5, 0.2],
                peaks: [0.2, 0.8],
                color: 0xE0E0E0,
                surfaceBlock: 7,
                subsurfaceBlock: 3,
                densityModifier: 1.3,
                baseHeight: 70,
                heightVariation: 30,
                caveThreshold: 0.75
            },
            mountains: {
                name: 'Montañas',
                temperature: [0, 0.5],
                humidity: [-0.5, 0.5],
                continentalness: [0.3, 1],
                erosion: [-0.5, 0.2],
                peaks: [0.3, 1],
                color: 0x8B7355,
                surfaceBlock: 3,
                subsurfaceBlock: 3,
                densityModifier: 1.4,
                baseHeight: 75,
                heightVariation: 35,
                caveThreshold: 0.7
            },
            highlands: {
                name: 'Tierras Altas',
                temperature: [-0.2, 0.6],
                humidity: [-0.3, 0.3],
                continentalness: [0.1, 0.6],
                erosion: [-0.2, 0.3],
                peaks: [0.1, 0.5],
                color: 0x90EE90,
                surfaceBlock: 2,
                subsurfaceBlock: 1,
                densityModifier: 1.1,
                baseHeight: 55,
                heightVariation: 15,
                caveThreshold: 0.65
            },
            plains: {
                name: 'Llanuras',
                temperature: [0.2, 0.8],
                humidity: [-0.2, 0.6],
                continentalness: [-0.2, 0.3],
                erosion: [-0.1, 0.5],
                peaks: [-0.5, 0.2],
                color: 0x7CFC00,
                surfaceBlock: 2,
                subsurfaceBlock: 1,
                densityModifier: 1.0,
                baseHeight: 45,
                heightVariation: 5,
                caveThreshold: 0.6
            },
            forest: {
                name: 'Bosque',
                temperature: [0.3, 0.7],
                humidity: [0.3, 0.8],
                continentalness: [-0.1, 0.4],
                erosion: [-0.1, 0.4],
                peaks: [-0.3, 0.3],
                color: 0x228B22,
                surfaceBlock: 2,
                subsurfaceBlock: 1,
                densityModifier: 1.0,
                baseHeight: 48,
                heightVariation: 8,
                caveThreshold: 0.6
            },
            jungle: {
                name: 'Jungla',
                temperature: [0.7, 1],
                humidity: [0.6, 1],
                continentalness: [-0.2, 0.3],
                erosion: [-0.2, 0.3],
                peaks: [-0.4, 0.2],
                color: 0x006400,
                surfaceBlock: 2,
                subsurfaceBlock: 1,
                densityModifier: 1.05,
                baseHeight: 50,
                heightVariation: 12,
                caveThreshold: 0.55
            },
            desert: {
                name: 'Desierto',
                temperature: [0.8, 1],
                humidity: [-1, -0.3],
                continentalness: [-0.3, 0.4],
                erosion: [-0.2, 0.5],
                peaks: [-0.5, 0.3],
                color: 0xFFD700,
                surfaceBlock: 6,
                subsurfaceBlock: 6,
                densityModifier: 0.95,
                baseHeight: 42,
                heightVariation: 8,
                caveThreshold: 0.65
            },
            savanna: {
                name: 'Sabana',
                temperature: [0.6, 0.9],
                humidity: [-0.5, 0],
                continentalness: [-0.2, 0.3],
                erosion: [-0.1, 0.4],
                peaks: [-0.4, 0.2],
                color: 0xBDB76B,
                surfaceBlock: 2,
                subsurfaceBlock: 1,
                densityModifier: 0.98,
                baseHeight: 44,
                heightVariation: 6,
                caveThreshold: 0.62
            },
            ocean: {
                name: 'Océano',
                temperature: [-1, 1],
                humidity: [-1, 1],
                continentalness: [-1, -0.3],
                erosion: [-1, 1],
                peaks: [-1, -0.2],
                color: 0x006994,
                surfaceBlock: 6,
                subsurfaceBlock: 6,
                densityModifier: 0.7,
                baseHeight: 25,
                heightVariation: 5,
                caveThreshold: 0.7
            },
            deep_ocean: {
                name: 'Océano Profundo',
                temperature: [-1, 1],
                humidity: [-1, 1],
                continentalness: [-1, -0.5],
                erosion: [-1, 1],
                peaks: [-1, -0.5],
                color: 0x003366,
                surfaceBlock: 6,
                subsurfaceBlock: 3,
                densityModifier: 0.6,
                baseHeight: 15,
                heightVariation: 3,
                caveThreshold: 0.75
            },
            beach: {
                name: 'Playa',
                temperature: [0.3, 0.8],
                humidity: [-0.5, 0.5],
                continentalness: [-0.35, -0.25],
                erosion: [-0.5, 0.5],
                peaks: [-0.5, 0],
                color: 0xFAF0E6,
                surfaceBlock: 6,
                subsurfaceBlock: 6,
                densityModifier: 0.85,
                baseHeight: 35,
                heightVariation: 3,
                caveThreshold: 0.6
            },
            mushroom_fields: {
                name: 'Campos de Hongos',
                temperature: [0.4, 0.6],
                humidity: [0.8, 1],
                continentalness: [-0.2, 0.1],
                erosion: [0.3, 0.6],
                peaks: [-0.2, 0.1],
                weirdness: [0.8, 1],
                color: 0xFF1493,
                surfaceBlock: 2,
                subsurfaceBlock: 1,
                densityModifier: 1.02,
                baseHeight: 46,
                heightVariation: 7,
                caveThreshold: 0.5
            },
            badlands: {
                name: 'Badlands',
                temperature: [0.9, 1],
                humidity: [-0.8, -0.4],
                continentalness: [0, 0.5],
                erosion: [0.4, 0.8],
                peaks: [-0.2, 0.4],
                color: 0xD2691E,
                surfaceBlock: 6,
                subsurfaceBlock: 6,
                densityModifier: 1.15,
                baseHeight: 60,
                heightVariation: 25,
                caveThreshold: 0.55
            }
        }
    },
    
    // Parámetros de generación 3D mejorados
    GENERATION_3D: {
        // Escalas de ruido para diferentes octavas
        NOISE_SCALES: {
            primary: 0.008,
            secondary: 0.015,
            detail: 0.03,
            cave: 0.02,
            ore: 0.1
        },
        // Amplitudes de ruido
        NOISE_AMPLITUDES: {
            primary: 1.0,
            secondary: 0.5,
            detail: 0.25,
            cave: 1.0
        },
        // Umbrales
        DENSITY_THRESHOLD: 0.0,
        SURFACE_THRESHOLD: 0.1,
        CAVE_THRESHOLD: 0.6,
        
        // Distribución de minerales
        ORE_DISTRIBUTION: {
            diamond: { minY: 0, maxY: 16, chance: 0.001, veinSize: 3 },
            emerald: { minY: 0, maxY: 32, chance: 0.0008, veinSize: 2 },
            gold: { minY: 0, maxY: 32, chance: 0.002, veinSize: 4 },
            redstone: { minY: 0, maxY: 16, chance: 0.008, veinSize: 6 },
            lapis: { minY: 0, maxY: 32, chance: 0.003, veinSize: 5 },
            iron: { minY: 0, maxY: 64, chance: 0.01, veinSize: 6 }
        }
    }
};