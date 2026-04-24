/**
 * 3D Model Generator — VK Mini App Frontend
 * Generates STL files via Flask backend using CadQuery
 * 
 * Features:
 * - Dynamic form fields based on selected model type
 * - Real-time validation of user input
 * - CORS-compatible API calls
 * - VK Bridge integration for Mini Apps
 * - Responsive design with dark mode support
 */

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ============================================================================

document.addEventListener('DOMContentLoaded', async function() {
    // Инициализация VK Bridge
    if (typeof vkBridge !== 'undefined') {
        try {
            await vkBridge.send('VKWebAppInit');
            console.log('✅ VK Bridge успешно инициализирован');
            
            // Настраиваем цветовую схему
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
    
    // Инициализация логики генератора
    initGenerator();
});

// ============================================================================
// КОНФИГУРАЦИЯ И КОНСТАНТЫ
// ============================================================================

/**
 * Базовый URL API бэкенда
 * ✅ Используем HTTPS + домен + порт для корректной работы
 */
const API_BASE_URL = 'https://3dcalk.freedynamicdns.net:8443';

/**
 * Конфигурация параметров для каждого типа модели
 * 
 * Структура:
 * - id: уникальный идентификатор поля (используется в JSON запросе)
 * - label: текст метки для пользователя
 * - type: тип HTML input (number, checkbox)
 * - min/max: ограничения для числовых полей
 * - step: шаг изменения значения
 * - value: значение по умолчанию
 * - required: обязательно ли поле
 */
const MODEL_CONFIGS = {
    // 📦 Прямоугольная коробка с защёлкой
    box: {
        name: 'Коробка с защёлкой',
        params: [
            { id: 'length', label: 'Длина (см)', type: 'number', min: 1, max: 30, step: 0.5, value: 10, required: true },
            { id: 'width', label: 'Ширина (см)', type: 'number', min: 1, max: 30, step: 0.5, value: 5, required: true },
            { id: 'height', label: 'Высота (см)', type: 'number', min: 1, max: 20, step: 0.5, value: 5, required: true }
        ]
    },
    
    // 📦 Крышка для прямоугольной коробки
    lid: {
        name: 'Крышка для коробки',
        params: [
            { id: 'length', label: 'Длина (см)', type: 'number', min: 1, max: 30, step: 0.5, value: 10, required: true },
            { id: 'width', label: 'Ширина (см)', type: 'number', min: 1, max: 30, step: 0.5, value: 5, required: true }
        ]
    },
    
    // ⚙️ Шестерня с коническими зубьями
    gear: {
        name: 'Шестерня',
        params: [
            { id: 'diameter', label: 'Диаметр (мм)', type: 'number', min: 15, max: 200, step: 1, value: 40, required: true },
            { id: 'teeth', label: 'Количество зубьев', type: 'number', min: 6, max: 80, step: 1, value: 16, required: true },
            { id: 'thickness', label: 'Толщина (мм)', type: 'number', min: 2, max: 50, step: 0.5, value: 5, required: true },
            { id: 'fillet', label: '✅ Скругление зубьев', type: 'checkbox', value: false, required: false }
        ]
    },
    
    // 🔩 Шайба / кольцо
    washer: {
        name: 'Шайба',
        params: [
            { id: 'outer_d', label: 'Внешний диаметр (мм)', type: 'number', min: 5, max: 100, step: 1, value: 20, required: true },
            { id: 'inner_d', label: 'Внутренний диаметр (мм)', type: 'number', min: 2, max: 90, step: 1, value: 10, required: true },
            { id: 'thickness', label: 'Толщина (мм)', type: 'number', min: 1, max: 20, step: 0.5, value: 2, required: true }
        ]
    },
    
    // 🗄️ Органайзер с перегородками
    organizer: {
        name: 'Органайзер',
        params: [
            { id: 'width', label: 'Ширина (мм)', type: 'number', min: 20, max: 200, step: 5, value: 100, required: true },
            { id: 'depth', label: 'Глубина (мм)', type: 'number', min: 20, max: 200, step: 5, value: 50, required: true },
            { id: 'height', label: 'Высота (мм)', type: 'number', min: 10, max: 100, step: 5, value: 30, required: true },
            { id: 'sections', label: 'Количество секций', type: 'number', min: 2, max: 8, step: 1, value: 3, required: true }
        ]
    },
    
    // ⚫ Круглая коробка
    'round-box': {
        name: 'Круглая коробка',
        params: [
            { id: 'diameter', label: 'Диаметр (см)', type: 'number', min: 2, max: 20, step: 0.5, value: 8, required: true },
            { id: 'height', label: 'Высота (см)', type: 'number', min: 1, max: 20, step: 0.5, value: 4, required: true }
        ]
    },
    
    // 🔵 Крышка для круглой коробки
    'round-lid': {
        name: 'Крышка для круглой',
        params: [
            { id: 'diameter', label: 'Диаметр коробки (см)', type: 'number', min: 2, max: 20, step: 0.5, value: 8, required: true }
        ]
    }
};

// ============================================================================
// DOM ЭЛЕМЕНТЫ (КЭШИРУЕМ ДЛЯ ПРОИЗВОДИТЕЛЬНОСТИ)
// ============================================================================

const elements = {
    modelType: document.getElementById('model-type'),
    paramsContainer: document.getElementById('params-container'),
    generateBtn: document.getElementById('generate-btn'),
    statusArea: document.getElementById('status-area'),
    resultArea: document.getElementById('result-area'),
    downloadLink: document.getElementById('download-link')
};

// Состояние приложения
let currentBlobUrl = null;

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ ГЕНЕРАТОРА
// ============================================================================

function initGenerator() {
    console.log('🚀 Инициализация 3D Generator...');
    
    // Обработчик смены типа модели
    elements.modelType.addEventListener('change', handleModelTypeChange);
    
    // Обработчик кнопки генерации
    elements.generateBtn.addEventListener('click', handleGenerateClick);
    
    // Обработчик кнопки скачивания
    elements.downloadLink.addEventListener('click', handleDownloadClick);
    
    // Инициализируем поля для выбранной по умолчанию модели
    renderParams();
    
    console.log('✅ Генератор готов к работе');
}

// ============================================================================
// ОБРАБОТКА СМЕНЫ ТИПА МОДЕЛИ
// ============================================================================

function handleModelTypeChange(event) {
    const modelType = event.target.value;
    console.log('🔄 Смена модели:', modelType);
    
    // Скрываем предыдущий результат при смене параметров
    hideResult();
    
    // Перерисовываем поля ввода
    renderParams();
}

// ============================================================================
// ОТРИСОВКА ДИНАМИЧЕСКИХ ПОЛЕЙ ПАРАМЕТРОВ
// ============================================================================

function renderParams() {
    const modelType = elements.modelType.value;
    const config = MODEL_CONFIGS[modelType];
    
    if (!config) {
        console.error('❌ Неизвестный тип модели:', modelType);
        return;
    }
    
    // Очищаем контейнер
    elements.paramsContainer.innerHTML = '';
    
    // Генерируем поля для каждого параметра
    config.params.forEach(function(param) {
        if (param.type === 'checkbox') {
            // Checkbox поле
            const row = document.createElement('div');
            row.className = 'option-row';
            row.innerHTML = 
                '<input type="checkbox" id="' + param.id + '" ' + (param.value ? 'checked' : '') + '>' +
                '<label for="' + param.id + '">' + param.label + '</label>';
            elements.paramsContainer.appendChild(row);
        } else {
            // Числовое поле
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
    
    console.log('✅ Поля отрисованы для модели:', config.name);
}

// ============================================================================
// СБОР ЗНАЧЕНИЙ ПАРАМЕТРОВ ИЗ ФОРМЫ
// ============================================================================

function collectParams() {
    const modelType = elements.modelType.value;
    const config = MODEL_CONFIGS[modelType];
    const params = {};
    
    if (!config) {
        throw new Error('Неизвестный тип модели: ' + modelType);
    }
    
    // Собираем значения для каждого параметра
    for (let i = 0; i < config.params.length; i++) {
        const param = config.params[i];
        const element = document.getElementById(param.id);
        
        if (!element) {
            console.warn('⚠️ Элемент не найден:', param.id);
            continue;
        }
        
        if (param.type === 'checkbox') {
            params[param.id] = element.checked;
        } else {
            const value = parseFloat(element.value);
            
            // Валидация числового значения
            if (isNaN(value)) {
                throw new Error(param.label + ' должно быть числом');
            }
            
            // Проверка диапазона
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

// ============================================================================
// ОБРАБОТКА КЛИКА ПО КНОПКЕ "СГЕНЕРИРОВАТЬ"
// ============================================================================

async function handleGenerateClick() {
    const modelType = elements.modelType.value;
    const config = MODEL_CONFIGS[modelType];
    
    if (!config) {
        showError('Неизвестный тип модели');
        return;
    }
    
    try {
        // Собираем и валидируем параметры
        const params = collectParams();
        
        // Блокируем интерфейс на время генерации
        setLoadingState(true);
        showStatus('⏳ Генерация модели...', 'loading');
        
        // Определяем endpoint API
        const endpoint = '/api/generate/' + modelType;
        
        // Отправляем запрос на сервер
        const response = await fetch(API_BASE_URL + endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/octet-stream'
            },
            body: JSON.stringify(params)
        });
        
        // Обработка ошибок HTTP
        if (!response.ok) {
            let errorMsg = 'Ошибка сервера: ' + response.status;
            
            try {
                const errorData = await response.json();
                if (errorData.error) {
                    errorMsg = errorData.error;
                }
            } catch (e) {
                // Если ответ не JSON, пробуем прочитать как текст
                try {
                    const text = await response.text();
                    if (text) errorMsg = text;
                } catch (e2) {
                    // Игнорируем
                }
            }
            
            throw new Error(errorMsg);
        }
        
        // Получаем бинарные данные файла
        const blob = await response.blob();
        
        // Извлекаем имя файла из заголовка Content-Disposition
        let filename = 'model_' + modelType + '.stl';
        const disposition = response.headers.get('Content-Disposition');
        if (disposition) {
            const match = disposition.match(/filename="?([^";]+)"?/);
            if (match && match[1]) {
                filename = match[1];
            }
        }
        
        // Создаём URL для скачивания
        if (currentBlobUrl) {
            URL.revokeObjectURL(currentBlobUrl);
        }
        currentBlobUrl = URL.createObjectURL(blob);
        
        // Настраиваем ссылку для скачивания
        elements.downloadLink.href = currentBlobUrl;
        elements.downloadLink.download = filename;
        
        // Показываем результат
        showResult(config.name, blob.size);
        showStatus('✅ Модель успешно сгенерирована!', 'success');
        
    } catch (error) {
        console.error('❌ Ошибка генерации:', error);
        showError(error.message || 'Произошла неизвестная ошибка');
    } finally {
        // Восстанавливаем интерфейс
        setLoadingState(false);
    }
}

// ============================================================================
// ОБРАБОТКА СКАЧИВАНИЯ ФАЙЛА
// ============================================================================

function handleDownloadClick(event) {
    // Позволяем стандартное поведение ссылки
    // Браузер сам обработает download атрибут
    console.log('💾 Начало скачивания файла...');
    
    // Можно добавить аналитику здесь
    if (typeof vkBridge !== 'undefined') {
        vkBridge.send('VKWebAppTrackEvent', {
            event: 'file_download',
            params: {
                file_type: 'stl',
                source: 'generator'
            }
        }).catch(function(e) {
            // Игнорируем ошибку, если событие не поддерживается
        });
    }
}

// ============================================================================
// УПРАВЛЕНИЕ СОСТОЯНИЕМ ИНТЕРФЕЙСА
// ============================================================================

function setLoadingState(isLoading) {
    elements.generateBtn.disabled = isLoading;
    elements.generateBtn.textContent = isLoading ? '⏳ Генерация...' : '🚀 Сгенерировать STL';
    elements.modelType.disabled = isLoading;
    
    // Блокируем все поля ввода
    const inputs = elements.paramsContainer.querySelectorAll('input, select');
    inputs.forEach(function(input) {
        input.disabled = isLoading;
    });
}

function showStatus(message, type) {
    elements.statusArea.textContent = message;
    elements.statusArea.className = 'status ' + type;
    elements.statusArea.classList.remove('hidden');
}

function hideStatus() {
    elements.statusArea.classList.add('hidden');
}

function showResult(modelName, fileSize) {
    document.querySelector('.result-card h3').textContent = modelName + ' готова!';
    document.getElementById('model-name').textContent = '📦 ' + modelName;
    document.getElementById('model-size').textContent = '~' + (fileSize / 1024).toFixed(1) + ' KB';
    elements.resultArea.classList.remove('hidden');
}

function hideResult() {
    elements.resultArea.classList.add('hidden');
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
// УТИЛИТЫ
// ============================================================================

/**
 * Форматирует размер файла в человекочитаемый вид
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Проверяет, запущено ли приложение в среде VK
 */
function isVKEnvironment() {
    return typeof vkBridge !== 'undefined' || 
           window.location.href.includes('vk.com') ||
           navigator.userAgent.includes('VKApp');
}

// ============================================================================
// ГЛОБАЛЬНЫЕ ОБРАБОТЧИКИ ОШИБОК
// ============================================================================

window.addEventListener('error', function(event) {
    console.error('🔴 Global error:', event.error);
    
    // Показываем понятное сообщение пользователю
    if (elements.statusArea) {
        elements.statusArea.textContent = '❌ Произошла ошибка в приложении';
        elements.statusArea.className = 'status error';
        elements.statusArea.classList.remove('hidden');
    }
});

window.addEventListener('unhandledrejection', function(event) {
    console.error('🔴 Unhandled promise rejection:', event.reason);
});

// ============================================================================
// ЭКСПОРТ ДЛЯ ОТЛАДКИ (только в режиме разработки)
// ============================================================================

if (window.location.hostname === 'localhost') {
    window.GeneratorDebug = {
        MODEL_CONFIGS: MODEL_CONFIGS,
        collectParams: collectParams,
        API_BASE_URL: API_BASE_URL
    };
    console.log('🔧 Debug mode enabled. Use window.GeneratorDebug for testing.');
}
