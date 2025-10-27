import { Command } from 'commander';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { XMLBuilder } from 'fast-xml-parser';

const program = new Command();

// Налаштування командного рядка
program
  .requiredOption('-i, --input <file>', 'Шлях до JSON файлу')
  .requiredOption('-h, --host <host>', 'Адреса сервера')
  .requiredOption('-p, --port <port>', 'Порт сервера', parseInt)
  .parse(process.argv);

const options = program.opts();

// Перевірка наявності файлу
try {
  await readFile(options.input);
} catch (error) {
  console.error('Cannot find input file');
  process.exit(1);
}

// Створення XML builder
const xmlBuilder = new XMLBuilder({
  format: true,
  ignoreAttributes: false,
  suppressEmptyNode: true
});

// Функція для читання та обробки JSON
async function processHouseData(queryParams) {
  try {
    const data = await readFile(options.input, 'utf8');
    const houses = JSON.parse(data);
    
    // Фільтрація даних
    let filteredHouses = houses;
    
    // Фільтр за furnishingstatus
    if (queryParams.furnished === 'true') {
      filteredHouses = filteredHouses.filter(house => 
        house.furnishingstatus === 'furnished'
      );
    }
    
    // Фільтр за максимальною ціною
    if (queryParams.max_price) {
      const maxPrice = parseInt(queryParams.max_price);
      filteredHouses = filteredHouses.filter(house => 
        parseInt(house.price) <= maxPrice
      );
    }
    
    // Формування результату
    const result = filteredHouses.map(house => ({
      house: {
        price: house.price,
        area: house.area,
        furnishingstatus: house.furnishingstatus
      }
    }));
    
    return { houses: result };
    
  } catch (error) {
    throw new Error('Помилка обробки даних: ' + error.message);
  }
}

// Створення HTTP сервера
const server = createServer(async (req, res) => {
  console.log(`Отримано запит: ${req.method} ${req.url}`);
  
  // Обробка тільки GET запитів
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }
  
  try {
    // Парсинг URL та параметрів запиту
    const url = new URL(req.url, `http://${options.host}:${options.port}`);
    const queryParams = Object.fromEntries(url.searchParams);
    
    // Обробка даних
    const processedData = await processHouseData(queryParams);
    
    // Конвертація в XML
    const xmlData = xmlBuilder.build(processedData);
    
    // Відправка відповіді
    res.writeHead(200, {
      'Content-Type': 'application/xml',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(xmlData);
    
  } catch (error) {
    console.error('Помилка обробки запиту:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

// Запуск сервера
server.listen(options.port, options.host, () => {
  console.log(`✅ Server running on ${options.host}:${options.port}`);
  console.log(`Обробляє файл: ${options.input}`);
  console.log('Доступні параметри:');
  console.log('  ?furnished=true - тільки мебльовані будинки');
  console.log('  ?max_price=X - будинки дешевші за X');
});

// Обробка помилок сервера
server.on('error', (error) => {
  console.error('Помилка сервера:', error);
});

// Граціозне завершення
process.on('SIGINT', () => {
  console.log('\nЗавершення роботи сервера...');
  server.close(() => {
    console.log('Сервер зупинено');
    process.exit(0);
  });
});
