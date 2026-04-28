//**
 * 3D Model Generator — VK Mini App Frontend
 * ✅ Fixed: Lazy initialization (init only when visible)
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
let viewerInitialized = false; // Флаг: создан ли уже viewer

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ============================================================================

document.addEventListener('DOMContentLoaded', async function() {
    if (typeof vkBridge !== 'undefined') {
        try {
            await vkBridge.send('VKWebAppInit');
        } catch (e) {}
    }
    
    // ✅ НЕ инициализируем 3D здесь! Ждем пока контейнер не станет видимым.
    
    // Обработчик скриншота
    const screenshotBtn = document.getElementById('screenshot-btn');
    if (screenshotBtn) {
        screenshotBtn.addEventListener('click', () => {
            if (viewerInitialized && viewerRenderer) {
                takeScreenshot();
            }
        });
    }
    
    initGenerator();
});

// ============================================================================
// 3D VIEWER (Ленивая инициализация)
// ============================================================================

function init3DViewer() {
    // Если уже создан — выходим
    if (viewerInitialized) return true;

    const container = document.getElementById('preview-container');
    if (!container) {
        console.error('❌ Контейнер не найден');
        return false;
    }

    // ✅ ПРОВЕРКА: Контейнер должен быть видимым и иметь размеры
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
        console.warn('⚠️ Контейнер имеет размер 0. Невозможно инициализировать 3D.');
        show3DFallback('Ошибка отображения (размер 0)');
        return false;
    }

    // Проверка WebGL
    if (!window.WebGLRenderingContext) {
        show3DFallback('WebGL не поддерживается браузером');
        return false;
    }
    
    if (typeof THREE === 'undefined') {
        show3DFallback('Библиотека 3D не загружена');
        return false;
    }

    try {
        console.log('🚀 Создание 3D Viewer...');
        
        // Сцена
        viewerScene = new THREE.Scene();
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        viewerScene.background = new THREE.Color(isDark ? 0x1a1a1a : 0xf4f6f8);
        
        // Камера
        viewerCamera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.1, 10000);
        viewerCamera.position.set(0, 0, 150);
        
        // Рендерер
        viewerRenderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            preserveDrawingBuffer: true, // Важно для скриншотов
            powerPreference: 'high-performance'
        });
        
        viewerRenderer.setSize(rect.width, rect.height);
        viewerRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        viewerRenderer.outputEncoding = THREE.sRGBEncoding;
        
        // Очистка и добавление
        while (container.firstChild) container.removeChild(container.firstChild);
        container.appendChild(viewerRenderer.domElement);
        
        // Свет
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(50, 50, 50);
        viewerScene.add(ambient, dirLight);
        
        // Сетка
        const grid = new THREE.GridHelper(200, 20, 0x888888, 0x444444);
        grid.position.y = -50;
        viewerScene.add(grid);
        
        // Оси
        const axes = new THREE.AxesHelper(50);
        axes.position.y = -50;
        viewerScene.add(axes);
        
        // Управление
        if (typeof THREE.OrbitControls !== 'undefined') {
            viewerControls = new THREE.OrbitControls(viewerCamera, viewerRenderer.domElement);
            viewerControls.enableDamping = true;
        }
        
        // Запуск цикла анимации
        animate3D();
        
        // Ресайз
        window.addEventListener('resize', on3DResize);
        
        viewerInitialized = true;
        console.log('✅ 3D Viewer создан успешно');
        return true;
        
    } catch (e) {
        console.error('❌ Ошибка создания 3D:', e);
        show3DFallback('Ошибка инициализации: ' + e.message);
        return false;
    }
}

function animate3D() {
    requestAnimationFrame(animate3D);
    if (viewerControls) viewerControls.update();
    if (viewerRenderer && viewerScene && viewerCamera) {
        viewerRenderer.render(viewerScene, viewerCamera);
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

// Загрузка STL модели в сцену
function loadSTLToViewer(blob) {
    return new Promise((resolve, reject) => {
        if (!viewerScene || typeof THREE.STLLoader === 'undefined') {
            reject(new Error('Viewer not ready'));
            return;
        }
        
        // Удаляем старую модель
        if (viewerMesh) {
            viewerScene.remove(viewerMesh);
            viewerMesh.geometry.dispose();
            viewerMesh.material.dispose();
        }
        
        const loader = new THREE.STLLoader();
        const url = URL.createObjectURL(blob);
        
        loader.load(url, (geometry) => {
            URL.revokeObjectURL(url);
            geometry.computeVertexNormals();
            geometry.center();
            
            const material = new THREE.MeshStandardMaterial({ color: 0x4a76a8, roughness: 0.4, metalness: 0.1 });
            viewerMesh = new THREE.Mesh(geometry, material);
            viewerScene.add(viewerMesh);
            
            // Центрируем камеру на модели
            const box = new THREE.Box3().setFromObject(viewerMesh);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = viewerCamera.fov * (Math.PI / 180);
            let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 2.0; // Отступ
            
            viewerCamera.position.set(center.x, center.y, center.z + cameraZ);
            viewerCamera.lookAt(center);
            if(viewerControls) viewerControls.target.copy(center);
            
            resolve();
        }, undefined, (err) => {
            URL.revokeObjectURL(url);
            reject(err);
        });
    });
}

function takeScreenshot() {
    if (!viewerRenderer) return;
    viewerRenderer.render(viewerScene, viewerCamera);
    const dataURL = viewerRenderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `3d-model-${Date.now()}.png`;
    link.href = dataURL;
    link.click();
}

function show3DFallback(message) {
    const container = document.getElementById('preview-container');
    if (!container) return;
    
    // Показываем сообщение об ошибке
    container.style.display = 'block';
    container.innerHTML = `
        <div style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#f4f6f8; color:#666; text-align:center; padding:20px;">
            <div style="font-size:40px; margin-bottom:10px;">⚠️</div>
            <div style="font-weight:bold;">3D-просмотр недоступен</div>
            <div style="font-size:12px; margin-top:5px;">${message}</div>
        </div>
    `;
    
    // Скрываем кнопку скриншота, так как 3D нет
    const btn = document.getElementById('screenshot-btn');
    if (btn) btn.style.display = 'none';
}

// ============================================================================
// ЛОГИКА ГЕНЕРАТОРА
// ============================================================================

const MODEL_CONFIGS = { /* ... ваш конфиг ... */
    box: { name: 'Коробка с защёлкой', params: [{ id: 'length', label: 'Длина (см)', type: 'number', min: 1, max: 30, step: 0.5, value: 10 }, { id: 'width', label: 'Ширина (см)', type: 'number', min: 1, max: 30, step: 0.5, value: 5 }, { id: 'height', label: 'Высота (см)', type: 'number', min: 1, max: 20, step: 0.5, value: 5 }] },
    lid: { name: 'Крышка', params: [{ id: 'length', label: 'Длина (см)', type: 'number', min: 1, max: 30, step: 0.5, value: 10 }, { id: 'width', label: 'Ширина (см)', type: 'number', min: 1, max: 30, step: 0.5, value: 5 }] },
    gear: { name: 'Шестерня', params: [{ id: 'diameter', label: 'Диаметр (мм)', type: 'number', min: 15, max: 200, step: 1, value: 40 }, { id: 'teeth', label: 'Зубьев', type: 'number', min: 6, max: 80, step: 1, value: 16 }, { id: 'thickness', label: 'Толщина (мм)', type: 'number', min: 2, max: 50, step: 0.5, value: 5 }] },
    washer: { name: 'Шайба', params: [{ id: 'outer_d', label: 'Внеш. диам. (мм)', type: 'number', min: 5, max: 100, step: 1, value: 20 }, { id: 'inner_d', label: 'Внут. диам. (мм)', type: 'number', min: 2, max: 90, step: 1, value: 10 }, { id: 'thickness', label: 'Толщина (мм)', type: 'number', min: 1, max: 20, step: 0.5, value: 2 }] },
    organizer: { name: 'Органайзер', params: [{ id: 'width', label: 'Ширина (мм)', type: 'number', min: 20, max: 200, step: 5, value: 100 }, { id: 'depth', label: 'Глубина (мм)', type: 'number', min: 20, max: 200, step: 5, value: 50 }, { id: 'height', label: 'Высота (мм)', type: 'number', min: 10, max: 100, step: 5, value: 30 }, { id: 'sections', label: 'Секций', type: 'number', min: 2, max: 8, step: 1, value: 3 }] },
    'round-box': { name: 'Круглая коробка', params: [{ id: 'diameter', label: 'Диаметр (см)', type: 'number', min: 2, max: 20, step: 0.5, value: 8 }, { id: 'height', label: 'Высота (см)', type: 'number', min: 1, max: 20, step: 0.5, value: 4 }] },
    'round-lid': { name: 'Крышка круглая', params: [{ id: 'diameter', label: 'Диаметр (см)', type: 'number', min: 2, max: 20, step: 0.5, value: 8 }] }
};

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

function initGenerator() {
    elements.modelType?.addEventListener('change', () => {
        hideResult();
        if(elements.previewContainer) elements.previewContainer.style.display = 'none';
        if(elements.screenshotBtn) elements.screenshotBtn.style.display = 'none';
        renderParams();
    });
    elements.generateBtn?.addEventListener('click', handleGenerateClick);
    renderParams();
}

function renderParams() {
    const config = MODEL_CONFIGS[elements.modelType?.value];
    if (!config) return;
    elements.paramsContainer.innerHTML = '';
    config.params.forEach(p => {
        if (p.type === 'checkbox') {
            elements.paramsContainer.innerHTML += `<div class="option-row"><input type="checkbox" id="${p.id}" ${p.value?'checked':''}><label for="${p.id}">${p.label}</label></div>`;
        } else {
            elements.paramsContainer.innerHTML += `<div class="param-row"><label class="input-label">${p.label}</label><input type="number" id="${p.id}" class="input-field" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.value}"></div>`;
        }
    });
}

async function handleGenerateClick() {
    const modelType = elements.modelType?.value;
    const config = MODEL_CONFIGS[modelType];
    if (!config) return;

    try {
        setLoading(true);
        showStatus('⏳ Генерация...', 'loading');
        
        const params = {};
        config.params.forEach(p => {
            const el = document.getElementById(p.id);
            params[p.id] = p.type === 'checkbox' ? el.checked : parseFloat(el.value);
        });

        const res = await fetch('https://3dcalk.freedynamicdns.net:8443/api/generate/' + modelType, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(params)
        });

        if (!res.ok) throw new Error('Ошибка сервера');
        
        const blob = await res.blob();
        
        // Скачивание
        const url = URL.createObjectURL(blob);
        elements.downloadLink.href = url;
        elements.downloadLink.download = `model_${modelType}.stl`;
        
        // ✅ 3D ПРЕВЬЮ: Сначала показываем контейнер!
        elements.previewContainer.style.display = 'block';
        elements.previewContainer.innerHTML = ''; // Очистка
        
        // ✅ Небольшая задержка, чтобы браузер применил display:block и вычислил размеры
        await new Promise(r => setTimeout(r, 100));
        
        // Теперь инициализируем 3D (контейнер уже имеет размеры)
        const success = init3DViewer();
        
        if (success) {
            elements.screenshotBtn.style.display = 'block';
            elements.screenshotBtn.textContent = '⏳ Рендеринг...';
            elements.screenshotBtn.disabled = true;
            
            await loadSTLToViewer(blob);
            
            elements.screenshotBtn.textContent = '📸 Сохранить скриншот';
            elements.screenshotBtn.disabled = false;
        } else {
            // Если init3DViewer вернул false, он уже показал fallback сообщение
        }

        showResult(config.name);
        showStatus('✅ Готово!', 'success');
        
    } catch (e) {
        showStatus('❌ ' + e.message, 'error');
    } finally {
        setLoading(false);
    }
}

function setLoading(isLoading) {
    elements.generateBtn.disabled = isLoading;
    elements.generateBtn.textContent = isLoading ? '⏳ ...' : '🚀 Сгенерировать STL';
    elements.paramsContainer.querySelectorAll('input').forEach(i => i.disabled = isLoading);
}

function showStatus(msg, type) {
    elements.statusArea.textContent = msg;
    elements.statusArea.className = 'status ' + type;
    elements.statusArea.classList.remove('hidden');
}

function showResult(name) {
    document.querySelector('.result-card h3').textContent = name + ' готова!';
    elements.resultArea.classList.remove('hidden');
}

function hideResult() {
    elements.resultArea.classList.add('hidden');
}
