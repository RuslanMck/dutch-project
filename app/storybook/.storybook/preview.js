import '../styles/tokens.css';
import '../styles/garden.css';
import '../styles/stories.css';

/** @type { import('@storybook/html').Preview } */
export default {
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
