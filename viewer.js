    import * as THREE from "https://esm.run/three@0.167.0";
    import { GLTFLoader } from "https://esm.run/three@0.167.0/examples/jsm/loaders/GLTFLoader.js";
    import { OrbitControls } from "https://esm.run/three@0.167.0/examples/jsm/controls/OrbitControls.js";
    import { DRACOLoader } from "https://esm.run/three@0.167.0/examples/jsm/loaders/DRACOLoader.js";







    // ---- MODEL FROM URL (ARCHIVE LOGIC) ----
    const params = new URLSearchParams(window.location.search);
    const modelName = params.get("model") || "model.glb"; // fallback
    const modelPath = `models/${modelName}`;

    console.log("Loading model:", modelPath);

    
    const container = document.getElementById("viewer");

    // ---- SETUP ----
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 1000);
    camera.position.set(0, 0, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // lights
    scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    // ---- LOAD MODEL ----
    let mesh1 = null;

    const loader = new GLTFLoader();

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(
    "https://www.gstatic.com/draco/v1/decoders/"
    );

    loader.setDRACOLoader(dracoLoader);



    let autoRotate = true;  // automatically rotate camera until click
    const autoRotateSpeed = 0.002; // slow rotation speed


    loader.load(modelPath, (gltf) => {

        const root = gltf.scene;
        scene.add(root);

        // Debug print all names
        root.traverse(obj => console.log(obj.name));

        mesh1 = root.getObjectByName("mesh_1");

// ---- CASE 1: REAL SUBMESH EXISTS ----
if (mesh1 && mesh1.isMesh) {
    const geom = mesh1.geometry;
    const uv = geom.attributes.uv;

    if (uv) {
        // all vertices active
        const fullMask = new Uint8Array(uv.count);
        fullMask.fill(1);
        mesh1.userData.movedVertexMask = fullMask;
    }

    // move real submesh in object space
    const submeshBox = new THREE.Box3().setFromObject(mesh1);
    const submeshSize = new THREE.Vector3();
    submeshBox.getSize(submeshSize);

    mesh1.position.y += submeshSize.y * 0.03;
}

// ---- CASE 2: NO SUBMESH → FAKE IT ----
else {
    console.warn("mesh_1 not found → applying fake submesh separation");

    root.traverse((obj) => {
        if (!mesh1 && obj.isMesh) {
            mesh1 = obj;
        }
    });

    if (mesh1) {
        const meshBox = new THREE.Box3().setFromObject(mesh1);
        const meshSize = new THREE.Vector3();
        meshBox.getSize(meshSize);

        fakeSubmeshByRandomTriangles(
            mesh1,
            0.3,
            meshSize.y * 0.03
        );
    }
}



        // ---- FIRST: FIT CAMERA + COMPUTE SIZE ----
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        root.position.sub(center);

        const maxDim = Math.max(size.x, size.y, size.z);
        const fitDist = maxDim * 1.5;
        const fov = camera.fov * (Math.PI / 180);
        const cameraDist = fitDist / Math.tan(fov / 2);

        camera.position.set(0, 0, cameraDist);
        camera.near = cameraDist / 100;
        camera.far = cameraDist * 100;
        camera.updateProjectionMatrix();

        // ---- TIME-BASED DISTORTION SCALED TO MODEL SIZE ----
        if (mesh1) {
            const now = new Date();
            const minutes = now.getMinutes();

            // map time 0–59 → -1 to 1
            const timeDistortion = (minutes / 59) * 2 - 1;

            // scale distortion proportionally to scan height
            const modelHeight = size.y;
            const distortionStrength = modelHeight * 0.01; // tweak value

            const finalDistortion = timeDistortion * distortionStrength;

            mesh1.position.y += finalDistortion;

            console.log("Time distortion:", timeDistortion);
            console.log("Model height:", modelHeight);
            console.log("Final distortion:", finalDistortion);
        }

        controls.update();
    });

    function fakeSubmeshByRandomTriangles(mesh, ratio = 0.5, yOffset = 1) {
    if (!mesh.geometry) return;

    const geom = mesh.geometry.clone();
    const nonIndexed = geom.toNonIndexed();

    const pos = nonIndexed.attributes.position;
    const uv = nonIndexed.attributes.uv;

    const triangleCount = pos.count / 3;

    // Boolean mask per vertex
    const movedVertexMask = new Uint8Array(pos.count);

    for (let i = 0; i < triangleCount; i++) {
        const moveThisTriangle = Math.random() < ratio;

        if (moveThisTriangle) {
            for (let v = 0; v < 3; v++) {
                const idx = i * 3 + v;
                pos.setY(idx, pos.getY(idx) + yOffset);
                movedVertexMask[idx] = 1; // mark vertex as movable
            }
        }
    }

    pos.needsUpdate = true;
    if (uv) uv.needsUpdate = true;

    nonIndexed.computeVertexNormals();

    mesh.geometry = nonIndexed;

    // 🔑 store mask for later UV logic
    mesh.userData.movedVertexMask = movedVertexMask;
}




    window.addEventListener("mousedown", (e) => {
        if (e.button === 0) {      // left mouse button
            autoRotate = false;    // stop auto rotation
        }

        isMouseDown = true;
        lastX = e.clientX;
        lastY = e.clientY;
    });


    // ---- DRAG UV SHIFT FOR MESH_1 ----
    let isMouseDown = false;
    let lastX = 0;
    let lastY = 0;

    window.addEventListener("mousedown", (e) => {
        isMouseDown = true;
        lastX = e.clientX;
        lastY = e.clientY;
    });

    window.addEventListener("mouseup", () => {
        isMouseDown = false;
    });

    window.addEventListener("mousemove", (e) => {
        if (!isMouseDown || !mesh1) return;

        // scale the UV effect ×2
        const dx = (e.clientX - lastX) * 0.0014; 
        const dy = (e.clientY - lastY) * 0.0014;

        lastX = e.clientX;
        lastY = e.clientY;

    mesh1.traverse((child) => {
        if (child.isMesh && child.geometry.attributes.uv) {
        const uv = child.geometry.attributes.uv;
        const mask = child.userData.movedVertexMask;

        for (let i = 0; i < uv.count; i++) {
            if (!mask || mask[i] === 0) continue;

            uv.setXY(i, uv.getX(i) + dx, uv.getY(i) + dy);
        }

        uv.needsUpdate = true;
    }
});

    });


    // ---- RESIZE ----
    window.addEventListener("resize", () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    });

    // ---- LOOP ----
    function animate() {
        requestAnimationFrame(animate);

        // automatic rotation before user interaction
        if (autoRotate) {
            const r = camera.position.length();
            const angle = autoRotateSpeed;

            // rotate camera around Y axis
            const x = camera.position.x;
            const z = camera.position.z;

            const newX = x * Math.cos(angle) - z * Math.sin(angle);
            const newZ = x * Math.sin(angle) + z * Math.cos(angle);

            camera.position.set(newX, camera.position.y, newZ);
            camera.lookAt(0, 0, 0);
        }

        controls.update();
        renderer.render(scene, camera);
    }

    animate();
