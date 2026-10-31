/** @type { import('@storybook/html-vite').StorybookConfig } */
export default {
  framework: { name: '@storybook/html-vite', options: {} },
  stories: ['../stories/**/*.mdx', '../stories/**/*.stories.js'],
  addons: ['@storybook/addon-essentials'],
  core: { disableTelemetry: true },
};
