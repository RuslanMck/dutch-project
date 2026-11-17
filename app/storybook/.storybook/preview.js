import '../styles/tokens.css';
import '../styles/garden.css';
import '../styles/stories.css';
import tokens from '../tokens/tokens.json';

// The toolbar's Тема switch puts a colour theme on <html>, the way public/theme.js does in the app.
const withTheme = (story, context) => {
  document.documentElement.dataset.theme = context.globals.theme ?? tokens.colorThemes.default;
  return story();
};

/** @type { import('@storybook/html').Preview } */
export default {
  globalTypes: {
    theme: {
      description: 'Colour theme',
      toolbar: {
        title: 'Тема',
        icon: 'paintbrush',
        items: Object.entries(tokens.colorThemes.list).map(([id, theme]) => ({ value: id, title: theme.name })),
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: tokens.colorThemes.default },
  decorators: [withTheme],
  parameters: {
    layout: 'padded',
    backgrounds: {
      default: 'paper',
      values: [
        { name: 'paper', value: '#f7f1e6' },
        { name: 'raised', value: '#fffcf7' },
      ],
    },
    controls: { expanded: true },
    options: {
      storySort: { order: ['Introduction', 'Foundations', 'Components', 'Sketches'] },
    },
  },
  tags: ['autodocs'],
};
