class SkyManager {
    constructor() {
        this.time = 0;
        this.skyColor = new THREE.Color(0x87CEEB);
        this.sunLight = new THREE.DirectionalLight(0xffffff, 1);
        this.sunLight.position.set(50, 100, 50);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.camera.left = -100;
        this.sunLight.shadow.camera.right = 100;
        this.sunLight.shadow.camera.top = 100;
        this.sunLight.shadow.camera.bottom = -100;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        window.game.scene.add(this.sunLight);

        // Luz ambiental
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        window.game.scene.add(this.ambientLight);

        // Crear cielo con gradiente
        this.createSky();
        this.createMinecraftClouds();
    }

    createSky() {
        const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
        const skyMaterial = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x0077ff) },
                bottomColor: { value: new THREE.Color(0xffffff) },
                offset: { value: 33 },
                exponent: { value: 0.6 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + offset).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
                }
            `,
            side: THREE.BackSide
        });
        
        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        window.game.scene.add(sky);
    }

    createMinecraftClouds() {
        // Crear nubes estilo Minecraft - planas y pixeladas
        const cloudGroup = new THREE.Group();
        const cloudMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide
        });

        // Función para crear una nube individual estilo Minecraft
        const createCloud = (x, y, z, width, depth) => {
            const cloudGeometry = new THREE.BoxGeometry(width, 4, depth);
            const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
            cloud.position.set(x, y, z);
            cloud.castShadow = false;
            cloud.receiveShadow = false;
            return cloud;
        };

        // Generar nubes planas estilo Minecraft
        for (let i = 0; i < 15; i++) {
            const cloudPart = new THREE.Group();
            
            // Patrón de nube estilo Minecraft (forma irregular pero plana)
            const baseX = Math.random() * 400 - 200;
            const baseZ = Math.random() * 400 - 200;
            const baseY = 100 + Math.random() * 20;
            
            // Centro de la nube
            cloudPart.add(createCloud(0, 0, 0, 20, 12));
            
            // Extensiones aleatorias para forma irregular
            if (Math.random() > 0.3) cloudPart.add(createCloud(10, 0, 0, 12, 8));
            if (Math.random() > 0.3) cloudPart.add(createCloud(-10, 0, 0, 12, 8));
            if (Math.random() > 0.3) cloudPart.add(createCloud(0, 0, 8, 16, 8));
            if (Math.random() > 0.3) cloudPart.add(createCloud(0, 0, -8, 16, 8));
            
            cloudPart.position.set(baseX, baseY, baseZ);
            cloudPart.userData.speed = 0.05 + Math.random() * 0.1;
            cloudGroup.add(cloudPart);
        }
        
        window.game.scene.add(cloudGroup);
        this.clouds = cloudGroup;
    }

    update(deltaTime) {
        this.time += deltaTime * 0.1;
        
        // Mover nubes lentamente como en Minecraft
        if (this.clouds) {
            this.clouds.children.forEach(cloud => {
                cloud.position.x += cloud.userData.speed;
                if (cloud.position.x > 250) {
                    cloud.position.x = -250;
                }
            });
        }
        
        // Actualizar posición del sol (ciclo día/noche simplificado)
        const sunAngle = this.time * 0.1;
        this.sunLight.position.x = Math.cos(sunAngle) * 100;
        this.sunLight.position.y = Math.sin(sunAngle) * 100 + 50;
        
        // Ajustar intensidad de luz según hora del día
        const intensity = Math.max(0.2, Math.sin(sunAngle));
        this.sunLight.intensity = intensity;
        this.ambientLight.intensity = 0.3 + intensity * 0.3;
    }
}