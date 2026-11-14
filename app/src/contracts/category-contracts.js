// Word categories: the topic of a word, stored in words.category as the id. The names are the Ukrainian labels of the
// app and of the achievements («Теми слів»). The order is the order of the categories everywhere.
import { z } from 'zod';

export const WORD_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'food', name: 'Їжа й напої' }),
  Object.freeze({ id: 'home', name: 'Дім і побут' }),
  Object.freeze({ id: 'clothes', name: 'Одяг' }),
  Object.freeze({ id: 'colours', name: 'Кольори' }),
  Object.freeze({ id: 'numbers', name: 'Числа й час' }),
  Object.freeze({ id: 'people', name: 'Люди й родина' }),
  Object.freeze({ id: 'body', name: 'Тіло й здоров\'я' }),
  Object.freeze({ id: 'city', name: 'Місто й транспорт' }),
  Object.freeze({ id: 'work', name: 'Робота й навчання' }),
  Object.freeze({ id: 'nature', name: 'Природа й погода' }),
  Object.freeze({ id: 'leisure', name: 'Відпочинок і хобі' }),
  Object.freeze({ id: 'feelings', name: 'Почуття й характер' }),
  Object.freeze({ id: 'actions', name: 'Дії' }),
  Object.freeze({ id: 'talk', name: 'Розмова й фрази' }),
  Object.freeze({ id: 'other', name: 'Інше' }),
]);

export const WORD_CATEGORY_IDS = Object.freeze(WORD_CATEGORIES.map(category => category.id));

// A category id, or null to clear it.
export const wordCategorySchema = z.enum(WORD_CATEGORY_IDS).nullable();
