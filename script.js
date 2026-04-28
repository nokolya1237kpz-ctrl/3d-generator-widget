/**
 * 3D Model Generator — VK Mini App Frontend
 * Generates STL files via Flask backend using CadQuery
 * 
 * ✅ Added: Three.js 3D preview with grid, axes, and screenshot
 */

// ============================================================================
// ИМПОРТЫ
// ============================================================================
import { STLViewer } from './stl-viewer.js';

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ============================================================================

document.addEventListener('DOMContentLoaded', async function() {
    // Инициализация VK Bridge
    if (typeof vkBridge !== 'undefined') {
        try {
            await vkBridge.send('VKWebAppInit');
            console.log('✅ VK Bridge успешно инициализирован');
            
            vkBridge.send('VKWebAppSetViewSettings', {
                status_bar_style: 'light',
                action_bar_color: '#5c8db6'
            }).catch(function(e) {
                console.log('ℹ️ View settings not applied:', e);
            });
        } catch (error) {
            console.warn('⚠️ Ошибка инициализации VK Bridge:', error);
        }
    } else {
        console.log('ℹ️ Приложение запущено вне VK — vkBridge недоступен');
    }
    
    // ✅ Инициализация 3D Viewer
    let viewer = null;
    try {
        viewer = new STLViewer('preview-container');
        console.log('✅ 3D Viewer инициализирован');
    } catch (e) {
        console.warn('⚠️ 3D Viewer не инициализирован:', e);
    }
    
    // ✅ Кнопка скриншота
    const screenshotBtn = document.getElementById('screenshot-btn');
    if (screenshotBtn && viewer) {
        screenshotBtn.addEventListener('click', () => {
            viewer.takeScreenshot();
        });
    }
    
    initGenerator();
});

// ============================================================================
// КОНФИГУРАЦИЯ
// ============================================================================

const API_BASE_URL = 'https://3dcalk.freedynamicdns.net:8443';

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

let currentBlobUrl = null;
let viewer = null; // Глобальная ссылка на viewer

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================================

function initGenerator() {
    console.log('🚀 Инициализация 3D Generator...');
    
    // ✅ Инициализация viewer если ещё не создан
    if (!viewer) {
        try {
            viewer = new STLViewer('preview-container');
        } catch (e) {
            console.warn('⚠️ Viewer init failed:', e);
        }
    }
    
    elements.modelType?.addEventListener('change', handleModelTypeChange);
    elements.generateBtn?.addEventListener('click', handleGenerateClick);
    elements.downloadLink?.addEventListener('click', handleDownloadClick);
    
    renderParams();
    console.log('✅ Генератор готов к работе');
}

// ============================================================================
// ОБРАБОТЧИКИ
// ============================================================================

function handleModelTypeChange(event) {
    hideResult();
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
        
        // ✅ 3D Preview: показываем контейнер и загружаем модель
        if (elements.previewContainer) {
            elements.previewContainer.style.display = 'block';
        }
        if (elements.screenshotBtn) {
            elements.screenshotBtn.style.display = 'block';
            elements.screenshotBtn.disabled = true;
            elements.screenshotBtn.textContent = '⏳ Рендеринг...';
        }
        
        if (viewer) {
            try {
                await viewer.loadFromBlob(blob);
                if (elements.screenshotBtn) {
                    elements.screenshotBtn.disabled = false;
                    elements.screenshotBtn.textContent = '📸 Сохранить скриншот';
                }
            } catch (e) {
                console.error('3D render error:', e);
                if (elements.previewContainer) elements.previewContainer.style.display = 'none';
                if (elements.screenshotBtn) elements.screenshotBtn.style.display = 'none';
            }
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

// ✅ Очистка при выгрузке страницы
window.addEventListener('beforeunload', () => {
    if (viewer) viewer.destroy();
    if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
});
