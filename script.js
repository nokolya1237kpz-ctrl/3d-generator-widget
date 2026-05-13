/**
 * 3D Model Generator — VK Mini App Frontend
 * Generates STL files via Flask backend using CadQuery
 * 
 * ✅ Lazy 3D initialization (only when container is visible)
 * ✅ Full error handling & dark theme support
 */

// ============================================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================================
let viewerScene = null;
let viewerCamera = null;
let viewerRenderer = null;
let viewerControls = null;
let viewerMesh = null;
let currentBlobUrl = null;
let currentDownloadUrl = null;
let currentFilename = null;
let viewerInitialized = false;

const API_BASE = 'https://3dcalk.freedynamicdns.net:8443';

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================================
document.addEventListener('DOMContentLoaded', function() {
    initGenerator();

    // VK Bridge не должен блокировать отрисовку параметров модели.
    if (typeof vkBridge !== 'undefined') {
        vkBridge.send('VKWebAppInit')
            .then(() => console.log('✅ VK Bridge OK'))
            .catch(e => console.warn('⚠️ VK Bridge:', e));
    }

    // Скриншот
    const screenshotBtn = document.getElementById('screenshot-btn');
    if (screenshotBtn) {
        screenshotBtn.addEventListener('click', () => {
            if (viewerInitialized && viewerRenderer) takeScreenshot();
        });
    }
});

// ============================================================================
// 3D VIEWER (LAZY INIT)
// ============================================================================
function init3DViewer() {
    if (viewerInitialized) return true;
    
    const container = document.getElementById('preview-container');
    if (!container) { console.error('❌ No preview container'); return false; }
    
    // ✅ Проверка размеров
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
        console.warn('⚠️ Container size 0');
        show3DFallback('Ошибка отображения (размер 0)');
        return false;
    }
    
    // WebGL check
    if (!window.WebGLRenderingContext) {
        show3DFallback('WebGL не поддерживается');
        return false;
    }
    
    if (typeof THREE === 'undefined') {
        show3DFallback('Библиотека 3D не загружена');
        return false;
    }
    
    try {
        console.log('🚀 Init 3D:', rect.width, 'x', rect.height);
        
        // Scene
        viewerScene = new THREE.Scene();
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        viewerScene.background = new THREE.Color(isDark ? 0x1a1a1a : 0xf4f6f8);
        
        // Camera
        viewerCamera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.1, 10000);
        viewerCamera.position.set(0, 0, 150);
        
        // Renderer
        viewerRenderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance'
        });
        viewerRenderer.setSize(rect.width, rect.height);
        viewerRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        viewerRenderer.outputEncoding = THREE.sRGBEncoding;
        
        // Clear & append
        while (container.firstChild) container.removeChild(container.firstChild);
        container.appendChild(viewerRenderer.domElement);
        
        // Lighting
        viewerScene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(50, 50, 50);
        viewerScene.add(dirLight);
        viewerScene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.4));
        
        // Grid & axes
        const grid = new THREE.GridHelper(200, 20, isDark ? 0x555555 : 0x888888, isDark ? 0x333333 : 0x444444);
        grid.position.y = -50;
        viewerScene.add(grid);
        
        const axes = new THREE.AxesHelper(50);
        axes.position.y = -50;
        viewerScene.add(axes);
        
        // Controls
        if (typeof THREE.OrbitControls !== 'undefined') {
            viewerControls = new THREE.OrbitControls(viewerCamera, viewerRenderer.domElement);
            viewerControls.enableDamping = true;
            viewerControls.dampingFactor = 0.05;
            viewerControls.minDistance = 10;
            viewerControls.maxDistance = 2000;
            viewerControls.target.set(0, -20, 0);
        }
        
        // Animation & resize
        animate3D();
        window.addEventListener('resize', on3DResize);
        
        viewerInitialized = true;
        console.log('✅ 3D Viewer ready');
        return true;
        
    } catch (e) {
        console.error('❌ 3D init error:', e);
        show3DFallback('Ошибка: ' + e.message);
        return false;
    }
}

function animate3D() {
    requestAnimationFrame(animate3D);
    if (viewerControls) viewerControls.update();
    if (viewerRenderer && viewerScene && viewerCamera) {
        try { viewerRenderer.render(viewerScene, viewerCamera); }
        catch (e) { console.error('❌ Render error:', e); }
    }
}

function on3DResize() {
    if (!viewerInitialized || !viewerRenderer) return;
    const container = document.getElementById('preview-container');
    if (!container) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    if (width > 0 && height > 0) {
        viewerCamera.aspect = width / height;
        viewerCamera.updateProjectionMatrix();
        viewerRenderer.setSize(width, height);
    }
}

function loadSTLToViewer(blob) {
    return new Promise((resolve, reject) => {
        if (!viewerInitialized || !viewerScene || typeof THREE.STLLoader === 'undefined') {
            reject(new Error('3D Viewer not ready'));
            return;
        }
        
        // Cleanup old mesh
        if (viewerMesh) {
            viewerScene.remove(viewerMesh);
            if (viewerMesh.geometry) viewerMesh.geometry.dispose();
            if (viewerMesh.material) viewerMesh.material.dispose();
            viewerMesh = null;
        }
        
        const loader = new THREE.STLLoader();
        const url = URL.createObjectURL(blob);
        
        loader.load(url, function(geometry) {
            URL.revokeObjectURL(url);
            
            if (!geometry || geometry.attributes.position.count === 0) {
                reject(new Error('Пустая геометрия'));
                return;
            }
            
            console.log('📐 Loaded:', geometry.attributes.position.count, 'vertices');
            geometry.computeVertexNormals();
            geometry.center();
            
            const material = new THREE.MeshStandardMaterial({
                color: 0x4a76a8,
                roughness: 0.4,
                metalness: 0.1,
                flatShading: false
            });
            
            viewerMesh = new THREE.Mesh(geometry, material);
            viewerScene.add(viewerMesh);
            
            fitCameraToObject(viewerMesh);
            resolve();
            
        }, undefined, function(error) {
            URL.revokeObjectURL(url);
            console.error('❌ STL load error:', error);
            reject(error);
        });
    });
}

function fitCameraToObject(object) {
    if (!viewerCamera || !viewerControls) return;
    
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    const fov = viewerCamera.fov * (Math.PI / 180);
    const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
    
    viewerCamera.position.set(center.x, center.y, center.z + cameraZ);
    viewerCamera.lookAt(center);
    
    if (viewerControls) {
        viewerControls.target.copy(center);
        viewerControls.update();
    }
}

function takeScreenshot() {
    if (!viewerInitialized || !viewerRenderer) {
        alert('❌ 3D-просмотр не готов');
        return;
    }
    
    try {
        viewerRenderer.render(viewerScene, viewerCamera);
        const canvas = viewerRenderer.domElement;
        
        if (canvas.width === 0 || canvas.height === 0) {
            alert('❌ Canvas size 0');
            return;
        }
        
        const dataURL = canvas.toDataURL('image/png');
        if (!dataURL || dataURL.length < 100) {
            alert('❌ Не удалось создать скриншот');
            return;
        }
        
        const link = document.createElement('a');
        link.download = `3d-preview-${Date.now()}.png`;
        link.href = dataURL;
        link.click();
        
        console.log('📸 Screenshot saved');
        
    } catch (e) {
        console.error('❌ Screenshot error:', e);
        alert('❌ Ошибка: ' + e.message);
    }
}

function show3DFallback(message) {
    const container = document.getElementById('preview-container');
    if (!container) return;
    
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    container.style.display = 'block';
    container.innerHTML = `
        <div style="
            width:100%;height:100%;
            display:flex;flex-direction:column;
            align-items:center;justify-content:center;
            background:${isDark ? '#1a1a1a' : '#f4f6f8'};
            color:${isDark ? '#e1e3e6' : '#666'};
            font-size:14px;text-align:center;
            padding:20px;box-sizing:border-box;
        ">
            <div style="font-size:48px;margin-bottom:12px;">📐</div>
            <div style="font-weight:600;margin-bottom:8px;">3D-просмотр недоступен</div>
            <div style="font-size:12px;opacity:0.8;margin-bottom:12px;">${message}</div>
            <div style="font-size:11px;opacity:0.6;">
                Модель успешно сгенерирована<br>и доступна для скачивания
            </div>
        </div>
    `;
    
    const screenshotBtn = document.getElementById('screenshot-btn');
    if (screenshotBtn) screenshotBtn.style.display = 'none';
    
    console.warn('⚠️ 3D fallback:', message);
}

function clear3DViewer() {
    if (viewerMesh && viewerScene) {
        viewerScene.remove(viewerMesh);
        if (viewerMesh.geometry) viewerMesh.geometry.dispose();
        if (viewerMesh.material) viewerMesh.material.dispose();
        viewerMesh = null;
    }
}

function destroy3DViewer() {
    window.removeEventListener('resize', on3DResize);
    clear3DViewer();
    if (viewerRenderer) {
        viewerRenderer.dispose();
        const container = document.getElementById('preview-container');
        if (container && container.contains(viewerRenderer.domElement)) {
            container.removeChild(viewerRenderer.domElement);
        }
    }
    viewerScene = null;
    viewerCamera = null;
    viewerRenderer = null;
    viewerControls = null;
    viewerInitialized = false;
}

// ============================================================================
// КОНФИГУРАЦИЯ МОДЕЛЕЙ
// ============================================================================
const MODEL_CONFIGS = {
    box: {
        name: 'Коробка с защёлкой',
        params: [
            { id: 'length', label: 'Длина (см)', type: 'number', min: 1, max: 30, step: 0.5, value: 10 },
            { id: 'width', label: 'Ширина (см)', type: 'number', min: 1, max: 30, step: 0.5, value: 5 },
            { id: 'height', label: 'Высота (см)', type: 'number', min: 1, max: 20, step: 0.5, value: 5 }
        ]
    },
    lid: {
        name: 'Крышка для коробки',
        params: [
            { id: 'length', label: 'Длина (см)', type: 'number', min: 1, max: 30, step: 0.5, value: 10 },
            { id: 'width', label: 'Ширина (см)', type: 'number', min: 1, max: 30, step: 0.5, value: 5 }
        ]
    },
    gear: {
        name: 'Шестерня',
        params: [
            { id: 'diameter', label: 'Диаметр (мм)', type: 'number', min: 15, max: 200, step: 1, value: 40 },
            { id: 'teeth', label: 'Количество зубьев', type: 'number', min: 6, max: 80, step: 1, value: 16 },
            { id: 'thickness', label: 'Толщина (мм)', type: 'number', min: 2, max: 50, step: 0.5, value: 5 },
            { id: 'add_fillet', label: '✅ Скругление зубьев', type: 'checkbox', value: false }
        ]
    },
    washer: {
        name: 'Шайба',
        params: [
            { id: 'outer_diameter', label: 'Внешний диаметр (мм)', type: 'number', min: 5, max: 100, step: 1, value: 20 },
            { id: 'inner_diameter', label: 'Внутренний диаметр (мм)', type: 'number', min: 2, max: 90, step: 1, value: 10 },
            { id: 'thickness', label: 'Толщина (мм)', type: 'number', min: 1, max: 20, step: 0.5, value: 2 }
        ]
    },
    organizer: {
        name: 'Органайзер',
        params: [
            { id: 'width', label: 'Ширина (мм)', type: 'number', min: 20, max: 200, step: 5, value: 100 },
            { id: 'depth', label: 'Глубина (мм)', type: 'number', min: 20, max: 200, step: 5, value: 50 },
            { id: 'height', label: 'Высота (мм)', type: 'number', min: 10, max: 100, step: 5, value: 30 },
            { id: 'sections', label: 'Количество секций', type: 'number', min: 2, max: 8, step: 1, value: 3 }
        ]
    },
    'round-box': {
        name: 'Круглая коробка',
        params: [
            { id: 'diameter', label: 'Диаметр (см)', type: 'number', min: 2, max: 20, step: 0.5, value: 8 },
            { id: 'height', label: 'Высота (см)', type: 'number', min: 1, max: 20, step: 0.5, value: 4 }
        ]
    },
    'round-lid': {
        name: 'Крышка для круглой',
        params: [
            { id: 'diameter', label: 'Диаметр коробки (см)', type: 'number', min: 2, max: 20, step: 0.5, value: 8 }
        ]
    },
    'phone-stand': {
        name: 'Подставка для телефона',
        params: [
            { id: 'width', label: 'Ширина (мм)', type: 'number', min: 50, max: 160, step: 5, value: 80 },
            { id: 'depth', label: 'Глубина основания (мм)', type: 'number', min: 40, max: 140, step: 5, value: 70 },
            { id: 'height', label: 'Высота спинки (мм)', type: 'number', min: 60, max: 180, step: 5, value: 110 },
            { id: 'angle', label: 'Наклон (градусы)', type: 'number', min: 5, max: 35, step: 1, value: 15 }
        ]
    },
    'cable-clip': {
        name: 'Кабельный клип',
        params: [
            { id: 'width', label: 'Ширина (мм)', type: 'number', min: 16, max: 80, step: 1, value: 28 },
            { id: 'depth', label: 'Длина (мм)', type: 'number', min: 16, max: 100, step: 1, value: 34 },
            { id: 'channel', label: 'Канал под кабель (мм)', type: 'number', min: 4, max: 60, step: 1, value: 10 },
            { id: 'height', label: 'Высота стенок (мм)', type: 'number', min: 6, max: 40, step: 1, value: 12 },
            { id: 'screw_d', label: 'Отверстие под саморез (мм, 0 = нет)', type: 'number', min: 0, max: 12, step: 0.5, value: 4 }
        ]
    },
    'planter': {
        name: 'Мини-кашпо',
        params: [
            { id: 'top_d', label: 'Верхний диаметр (мм)', type: 'number', min: 40, max: 180, step: 5, value: 90 },
            { id: 'bottom_d', label: 'Нижний диаметр (мм)', type: 'number', min: 30, max: 180, step: 5, value: 65 },
            { id: 'height', label: 'Высота (мм)', type: 'number', min: 40, max: 180, step: 5, value: 80 },
            { id: 'wall', label: 'Толщина стенки (мм)', type: 'number', min: 1.2, max: 6, step: 0.2, value: 2.4 },
            { id: 'drainage_holes', label: 'Дренажные отверстия', type: 'number', min: 0, max: 12, step: 1, value: 5 }
        ]
    },
    'shelf-bracket': {
        name: 'Кронштейн для полки',
        params: [
            { id: 'width', label: 'Ширина (мм)', type: 'number', min: 30, max: 120, step: 5, value: 50 },
            { id: 'height', label: 'Высота (мм)', type: 'number', min: 40, max: 180, step: 5, value: 80 },
            { id: 'depth', label: 'Глубина (мм)', type: 'number', min: 40, max: 180, step: 5, value: 80 },
            { id: 'thickness', label: 'Толщина (мм)', type: 'number', min: 3, max: 12, step: 0.5, value: 5 },
            { id: 'screw_d', label: 'Отверстия под саморез (мм, 0 = нет)', type: 'number', min: 0, max: 12, step: 0.5, value: 4.5 }
        ]
    }
};

// ============================================================================
// DOM ЭЛЕМЕНТЫ
// ============================================================================
const elements = {
    modelType: document.getElementById('model-type'),
    paramsContainer: document.getElementById('params-container'),
    generateBtn: document.getElementById('generate-btn'),
    statusArea: document.getElementById('status-area'),
    resultArea: document.getElementById('result-area'),
    downloadLink: document.getElementById('download-link'),
    previewContainer: document.getElementById('preview-container'),
    screenshotBtn: document.getElementById('screenshot-btn'),
    backBtn: document.getElementById('back-btn')
};

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ГЕНЕРАТОРА
// ============================================================================
function initGenerator() {
    console.log('🚀 Init generator...');
    
    if (elements.modelType) {
        elements.modelType.addEventListener('change', handleModelTypeChange);
    }
    if (elements.generateBtn) {
        elements.generateBtn.addEventListener('click', handleGenerateClick);
    }
    if (elements.downloadLink) {
        elements.downloadLink.addEventListener('click', handleDownloadClick);
    }
    if (elements.backBtn) {
        elements.backBtn.addEventListener('click', handleBackClick);
    }
    
    renderParams();
    console.log('✅ Generator ready');
}

// ============================================================================
// ОБРАБОТЧИКИ
// ============================================================================
function handleModelTypeChange() {
    hideResult();
    if (elements.previewContainer) {
        elements.previewContainer.style.display = 'none';
        elements.previewContainer.innerHTML = '';
    }
    if (elements.screenshotBtn) elements.screenshotBtn.style.display = 'none';
    clear3DViewer();
    viewerInitialized = false;
    renderParams();
}

function renderParams() {
    const modelType = elements.modelType?.value;
    const config = MODEL_CONFIGS[modelType];
    
    if (!config || !elements.paramsContainer) return;
    
    elements.paramsContainer.innerHTML = '';
    
    config.params.forEach(function(param) {
        if (param.type === 'checkbox') {
            const row = document.createElement('div');
            row.className = 'option-row';
            row.innerHTML = 
                '<input type="checkbox" id="' + param.id + '" ' + (param.value ? 'checked' : '') + '>' +
                '<label for="' + param.id + '">' + param.label + '</label>';
            elements.paramsContainer.appendChild(row);
        } else {
            const row = document.createElement('div');
            row.className = 'param-row';
            row.innerHTML = 
                '<label for="' + param.id + '" class="input-label">' + param.label + '</label>' +
                '<input type="' + param.type + '" id="' + param.id + '" ' +
                'class="input-field" ' +
                'min="' + param.min + '" ' +
                'max="' + param.max + '" ' +
                'step="' + param.step + '" ' +
                'value="' + param.value + '"' +
                (param.required ? ' required' : '') + '>';
            elements.paramsContainer.appendChild(row);
        }
    });
}

function collectParams() {
    const modelType = elements.modelType?.value;
    const config = MODEL_CONFIGS[modelType];
    const params = {};
    
    if (!config) throw new Error('Неизвестный тип модели: ' + modelType);
    
    for (let i = 0; i < config.params.length; i++) {
        const param = config.params[i];
        const element = document.getElementById(param.id);
        
        if (!element) continue;
        
        if (param.type === 'checkbox') {
            params[param.id] = element.checked;
        } else {
            const value = parseFloat(element.value);
            if (isNaN(value)) throw new Error(param.label + ' должно быть числом');
            if (param.min !== undefined && value < param.min) {
                throw new Error(param.label + ' не может быть меньше ' + param.min);
            }
            if (param.max !== undefined && value > param.max) {
                throw new Error(param.label + ' не может быть больше ' + param.max);
            }
            params[param.id] = value;
        }
    }
    
    return params;
}

async function handleGenerateClick() {
    const modelType = elements.modelType?.value;
    const config = MODEL_CONFIGS[modelType];
    
    if (!config) {
        showError('Неизвестный тип модели');
        return;
    }
    
    try {
        const params = collectParams();
        
        setLoadingState(true);
        showStatus('⏳ Генерация модели...', 'loading');
        
        const endpoint = '/api/generate/' + modelType;
        
        const response = await fetch(API_BASE + endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/octet-stream'
            },
            body: JSON.stringify(params)
        });
        
        if (!response.ok) {
            let errorMsg = 'Ошибка сервера: ' + response.status;
            try {
                const errorData = await response.json();
                if (errorData.error) errorMsg = errorData.error;
            } catch (e) {
                try {
                    const text = await response.text();
                    if (text) errorMsg = text;
                } catch (e2) {}
            }
            throw new Error(errorMsg);
        }
        
        const blob = await response.blob();
        
        let filename = 'model_' + modelType + '.stl';
        const disposition = response.headers.get('Content-Disposition');
        if (disposition) {
            const match = disposition.match(/filename="?([^";]+)"?/);
            if (match && match[1]) filename = match[1];
        }
        
        const serverDownloadUrl = response.headers.get('X-Download-Url');
        const serverFilename = response.headers.get('X-Download-Filename');
        if (serverFilename) filename = serverFilename;

        if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = URL.createObjectURL(blob);
        currentDownloadUrl = serverDownloadUrl || currentBlobUrl;
        currentFilename = filename;

        elements.downloadLink.dataset.href = currentDownloadUrl;
        elements.downloadLink.dataset.filename = filename;
        
        // ✅ Показываем контейнер ПЕРЕД инициализацией 3D
        if (elements.previewContainer) {
            elements.previewContainer.style.display = 'block';
            elements.previewContainer.innerHTML = '';
        }
        
        // ✅ Небольшая задержка для применения стилей
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // ✅ Теперь инициализируем 3D
        const success = init3DViewer();
        
        if (success && viewerInitialized) {
            if (elements.screenshotBtn) {
                elements.screenshotBtn.style.display = 'block';
                elements.screenshotBtn.disabled = true;
                elements.screenshotBtn.textContent = '⏳ Рендеринг...';
            }
            
            try {
                await loadSTLToViewer(blob);
                if (elements.screenshotBtn) {
                    elements.screenshotBtn.disabled = false;
                    elements.screenshotBtn.textContent = '📸 Сохранить скриншот';
                }
            } catch (e) {
                console.error('⚠️ 3D render error:', e);
                if (elements.screenshotBtn) elements.screenshotBtn.style.display = 'none';
            }
        } else {
            console.warn('⚠️ 3D Viewer not initialized');
            if (elements.screenshotBtn) elements.screenshotBtn.style.display = 'none';
        }
        
        showResult(config.name, blob.size);
        showStatus('✅ Модель успешно сгенерирована!', 'success');
        
    } catch (error) {
        console.error('❌ Generation error:', error);
        showError(error.message || 'Произошла неизвестная ошибка');
    } finally {
        setLoadingState(false);
    }
}

async function handleDownloadClick(event) {
    if (event) event.preventDefault();
    console.log('💾 Download started');

    if (!currentDownloadUrl) {
        showError('Сначала сгенерируйте модель');
        return;
    }

    const filename = currentFilename || 'model.stl';
    const isHttpUrl = /^https?:\/\//i.test(currentDownloadUrl);

    if (typeof vkBridge !== 'undefined') {
        vkBridge.send('VKWebAppTrackEvent', {
            event: 'file_download',
            params: { file_type: 'stl', source: 'generator' }
        }).catch(function() {});

        if (isHttpUrl) {
            try {
                await vkBridge.send('VKWebAppDownloadFile', {
                    url: currentDownloadUrl,
                    filename: filename
                });
                showStatus('✅ Скачивание началось', 'success');
                return;
            } catch (e) {
                console.warn('⚠️ VK download failed, fallback:', e);
            }
        }
    }

    fallbackDownload(currentDownloadUrl, filename);
}

function fallbackDownload(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (/iPad|iPhone|iPod/.test(navigator.userAgent) && /^https?:\/\//i.test(url)) {
        setTimeout(() => { window.location.href = url; }, 250);
    }
}

async function handleBackClick() {
    if (window.history.length > 1 && document.referrer) {
        window.history.back();
        return;
    }

    if (typeof vkBridge !== 'undefined') {
        try {
            await vkBridge.send('VKWebAppClose', { status: 'success' });
            return;
        } catch (e) {
            console.warn('⚠️ VK close failed:', e);
        }
    }

    showStatus('Откройте главное меню из приложения VK', 'loading');
}

// ============================================================================
// УПРАВЛЕНИЕ СОСТОЯНИЕМ
// ============================================================================
function setLoadingState(isLoading) {
    if (elements.generateBtn) {
        elements.generateBtn.disabled = isLoading;
        elements.generateBtn.textContent = isLoading ? '⏳ Генерация...' : '🚀 Сгенерировать STL';
    }
    if (elements.modelType) elements.modelType.disabled = isLoading;
    
    const inputs = elements.paramsContainer?.querySelectorAll('input, select');
    if (inputs) inputs.forEach(input => { input.disabled = isLoading; });
}

function showStatus(message, type) {
    if (elements.statusArea) {
        elements.statusArea.textContent = message;
        elements.statusArea.className = 'status ' + type;
        elements.statusArea.classList.remove('hidden');
    }
}

function hideStatus() {
    elements.statusArea?.classList.add('hidden');
}

function showResult(modelName, fileSize) {
    const h3 = document.querySelector('.result-card h3');
    if (h3) h3.textContent = modelName + ' готова!';
    
    const nameEl = document.getElementById('model-name');
    if (nameEl) nameEl.textContent = '📦 ' + modelName;
    
    const sizeEl = document.getElementById('model-size');
    if (sizeEl) sizeEl.textContent = '~' + (fileSize / 1024).toFixed(1) + ' KB';
    
    if (elements.resultArea) {
        elements.resultArea.classList.remove('hidden');
    }
}

function hideResult() {
    if (elements.resultArea) {
        elements.resultArea.classList.add('hidden');
    }
    if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
    }
    currentDownloadUrl = null;
    currentFilename = null;
}

function showError(message) {
    showStatus('❌ ' + message, 'error');
    hideResult();
}

// ============================================================================
// ГЛОБАЛЬНЫЕ ОБРАБОТЧИКИ
// ============================================================================
window.addEventListener('error', function(event) {
    console.error('🔴 Global error:', event.error);
    if (elements.statusArea) {
        elements.statusArea.textContent = '❌ Произошла ошибка в приложении';
        elements.statusArea.className = 'status error';
        elements.statusArea.classList.remove('hidden');
    }
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('🔴 Unhandled rejection:', event.reason);
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
    destroy3DViewer();
    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
});
