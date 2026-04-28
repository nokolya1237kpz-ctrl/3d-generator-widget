/**
 * 3D Model Generator — VK Mini App Frontend
 * Generates STL files via Flask backend using CadQuery
 * 
 * ✅ Three.js 3D preview with grid, axes, screenshot (global scripts)
 */

// ============================================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ДЛЯ 3D
// ============================================================================
let viewerScene = null;
let viewerCamera = null;
let viewerRenderer = null;
let viewerControls = null;
let viewerMesh = null;
let currentBlobUrl = null;

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ============================================================================

document.addEventListener('DOMContentLoaded', async function() {
    // Инициализация VK Bridge
    if (typeof vkBridge !== 'undefined') {
        try {
            await vkBridge.send('VKWebAppInit');
            console.log('✅ VK Bridge инициализирован');
        } catch (error) {
            console.warn('⚠️ Ошибка инициализации VK Bridge:', error);
        }
    }
    
    // Инициализация 3D Viewer
    init3DViewer();
    
    // Инициализация генератора
    initGenerator();
});

// ============================================================================
// 3D VIEWER (с проверкой WebGL и обработкой ошибок)
// ============================================================================

function init3DViewer() {
    const container = document.getElementById('preview-container');
    if (!container) {
        console.warn('⚠️ 3D Viewer: контейнер не найден');
        return;
    }
    
    // ✅ Проверка поддержки WebGL
    if (!window.WebGLRenderingContext) {
        show3DFallback('Ваш браузер не поддерживает WebGL');
        return;
    }
    
    // ✅ Проверка Three.js
    if (typeof THREE === 'undefined') {
        console.warn('⚠️ Three.js не загружен');
        show3DFallback('Библиотека 3D не загружена');
        return;
    }
    
    try {
        // Проверка поддержки WebGL контекста
        const testCanvas = document.createElement('canvas');
        const gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
        
        if (!gl) {
            show3DFallback('WebGL не поддерживается');
            return;
        }
        
        // Сцена
        viewerScene = new THREE.Scene();
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        viewerScene.background = new THREE.Color(isDark ? 0x1a1a1a : 0xf4f6f8);
        
        // Камера
        viewerCamera = new THREE.PerspectiveCamera(
            45, 
            container.clientWidth / container.clientHeight, 
            0.1, 
            10000
        );
        viewerCamera.position.set(0, 0, 150);
        
        // Рендерер с дополнительной проверкой
        viewerRenderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            preserveDrawingBuffer: true,  // ✅ Важно для скриншотов
            alpha: false,
            powerPreference: 'high-performance'
        });
        
        // ✅ Проверка размера контейнера
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        if (width === 0 || height === 0) {
            console.warn('⚠️ Контейнер 3D имеет нулевой размер:', width, height);
            show3DFallback('Контейнер не имеет размеров');
            return;
        }
        
        viewerRenderer.setSize(width, height);
        viewerRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        viewerRenderer.outputEncoding = THREE.sRGBEncoding;
        
        // ✅ Очистка предыдущего canvas если есть
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
        
        container.appendChild(viewerRenderer.domElement);
        
        // Освещение
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(50, 50, 50);
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
        viewerScene.add(ambient, dirLight, hemiLight);
        
        // Сетка координат
        const grid = new THREE.GridHelper(200, 20, 
            isDark ? 0x555555 : 0x888888, 
            isDark ? 0x333333 : 0x444444);
        grid.position.y = -50;
        viewerScene.add(grid);
        
        // Оси координат
        const axes = new THREE.AxesHelper(50);
        axes.position.y = -50;
        viewerScene.add(axes);
        
        // Управление камерой
        if (typeof THREE.OrbitControls !== 'undefined') {
            viewerControls = new THREE.OrbitControls(viewerCamera, viewerRenderer.domElement);
            viewerControls.enableDamping = true;
            viewerControls.dampingFactor = 0.05;
            viewerControls.minDistance = 10;
            viewerControls.maxDistance = 2000;
            viewerControls.target.set(0, -20, 0);
        }
        
        // Анимация
        animate3D();
        
        // Ресайз
        window.addEventListener('resize', on3DResize);
        
        console.log('✅ 3D Viewer инициализирован');
        console.log('📐 Размер canvas:', width, 'x', height);
        
    } catch (e) {
        console.error('❌ Ошибка инициализации 3D Viewer:', e);
        show3DFallback('Ошибка 3D: ' + e.message);
    }
}

// ✅ Fallback сообщение если 3D не работает
function show3DFallback(message) {
    const container = document.getElementById('preview-container');
    if (!container) return;
    
    container.style.display = 'block';
    container.innerHTML = `
        <div style="
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: ${window.matchMedia('(prefers-color-scheme: dark)').matches ? '#1a1a1a' : '#f4f6f8'};
            color: ${window.matchMedia('(prefers-color-scheme: dark)').matches ? '#e1e3e6' : '#666'};
            font-size: 14px;
            text-align: center;
            padding: 20px;
        ">
            <div style="font-size: 48px; margin-bottom: 12px;">📐</div>
            <div style="font-weight: 600; margin-bottom: 8px;">3D-просмотр недоступен</div>
            <div style="font-size: 12px; opacity: 0.8;">${message}</div>
            <div style="margin-top: 12px; font-size: 11px; opacity: 0.6;">
                Модель успешно сгенерирована<br>и доступна для скачивания
            </div>
        </div>
    `;
    
    // Скрываем кнопку скриншота если 3D не работает
    const screenshotBtn = document.getElementById('screenshot-btn');
    if (screenshotBtn) {
        screenshotBtn.style.display = 'none';
    }
    
    console.warn('⚠️ 3D Viewer fallback:', message);
}

function animate3D() {
    requestAnimationFrame(animate3D);
    if (viewerControls) viewerControls.update();
    if (viewerRenderer && viewerScene && viewerCamera) {
        try {
            viewerRenderer.render(viewerScene, viewerCamera);
        } catch (e) {
            console.error('❌ Ошибка рендеринга:', e);
        }
    }
}

function on3DResize() {
    const container = document.getElementById('preview-container');
    if (!container || !viewerCamera || !viewerRenderer) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    if (width === 0 || height === 0) {
        console.warn('⚠️ Контейнер 3D имеет нулевой размер при ресайзе');
        return;
    }
    
    viewerCamera.aspect = width / height;
    viewerCamera.updateProjectionMatrix();
    viewerRenderer.setSize(width, height);
}

function loadSTLToViewer(blob) {
    return new Promise((resolve, reject) => {
        if (!viewerScene || typeof THREE.STLLoader === 'undefined') {
            reject(new Error('3D Viewer not initialized'));
            return;
        }
        
        // Очистка старой модели
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
            
            // ✅ Проверка геометрии
            if (!geometry || geometry.attributes.position.count === 0) {
                reject(new Error('Пустая геометрия'));
                return;
            }
            
            console.log('📐 Загружена геометрия:', geometry.attributes.position.count, 'вершин');
            
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
            console.error('❌ Ошибка загрузки STL в 3D:', error);
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

// ✅ Исправленная функция скриншота
function takeScreenshot() {
    if (!viewerRenderer || !viewerScene || !viewerCamera) {
        alert('❌ 3D-просмотр не инициализирован');
        return;
    }
    
    try {
        // ✅ Принудительный рендер перед скриншотом
        viewerRenderer.render(viewerScene, viewerCamera);
        
        // ✅ Проверка что canvas не пустой
        const canvas = viewerRenderer.domElement;
        if (canvas.width === 0 || canvas.height === 0) {
            alert('❌ Canvas имеет нулевой размер');
            return;
        }
        
        // ✅ Получаем данные изображения
        const dataURL = canvas.toDataURL('image/png');
        
        // ✅ Проверка что dataURL не пустой
        if (!dataURL || dataURL.length < 100) {
            alert('❌ Не удалось создать скриншот');
            return;
        }
        
        const link = document.createElement('a');
        link.download = `3d-preview-${Date.now()}.png`;
        link.href = dataURL;
        link.click();
        
        console.log('📸 Скриншот сохранён:', dataURL.length, 'байт');
        
    } catch (e) {
        console.error('❌ Ошибка создания скриншота:', e);
        alert('❌ Ошибка при создании скриншота: ' + e.message);
    }
}

function clear3DViewer() {
    if (viewerMesh) {
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
            { id: 'fillet', label: '✅ Скругление зубьев', type: 'checkbox', value: false }
        ]
    },
    washer: {
        name: 'Шайба',
        params: [
            { id: 'outer_d', label: 'Внешний диаметр (мм)', type: 'number', min: 5, max: 100, step: 1, value: 20 },
            { id: 'inner_d', label: 'Внутренний диаметр (мм)', type: 'number', min: 2, max: 90, step: 1, value: 10 },
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
    screenshotBtn: document.getElementById('screenshot-btn')
};

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ГЕНЕРАТОРА
// ============================================================================

function initGenerator() {
    console.log('🚀 Инициализация генератора...');
    
    if (elements.modelType) {
        elements.modelType.addEventListener('change', handleModelTypeChange);
    }
    if (elements.generateBtn) {
        elements.generateBtn.addEventListener('click', handleGenerateClick);
    }
    if (elements.downloadLink) {
        elements.downloadLink.addEventListener('click', handleDownloadClick);
    }
    if (elements.screenshotBtn) {
        elements.screenshotBtn.addEventListener('click', () => {
            if (typeof takeScreenshot === 'function') takeScreenshot();
        });
    }
    
    renderParams();
    console.log('✅ Генератор готов');
}

// ============================================================================
// ОБРАБОТЧИКИ
// ============================================================================

function handleModelTypeChange(event) {
    hideResult();
    if (elements.previewContainer) elements.previewContainer.style.display = 'none';
    if (elements.screenshotBtn) elements.screenshotBtn.style.display = 'none';
    clear3DViewer();
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
        const API_BASE_URL = 'https://3dcalk.freedynamicdns.net:8443';
        
        const response = await fetch(API_BASE_URL + endpoint, {
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
        
        if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = URL.createObjectURL(blob);
        
        elements.downloadLink.href = currentBlobUrl;
        elements.downloadLink.download = filename;
        
        // ✅ 3D Preview
        if (elements.previewContainer) {
            elements.previewContainer.style.display = 'block';
        }
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
            // Не прерываем работу, если 3D не загрузился
        }
        
        showResult(config.name, blob.size);
        showStatus('✅ Модель успешно сгенерирована!', 'success');
        
    } catch (error) {
        console.error('❌ Ошибка генерации:', error);
        showError(error.message || 'Произошла неизвестная ошибка');
    } finally {
        setLoadingState(false);
    }
}

function handleDownloadClick() {
    console.log('💾 Начало скачивания файла...');
    if (typeof vkBridge !== 'undefined') {
        vkBridge.send('VKWebAppTrackEvent', {
            event: 'file_download',
            params: { file_type: 'stl', source: 'generator' }
        }).catch(function() {});
    }
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
    
    elements.resultArea?.classList.remove('hidden');
}

function hideResult() {
    elements.resultArea?.classList.add('hidden');
    if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
    }
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
    console.error('🔴 Unhandled promise rejection:', event.reason);
});

// Очистка при выгрузке
window.addEventListener('beforeunload', () => {
    destroy3DViewer();
    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
});
