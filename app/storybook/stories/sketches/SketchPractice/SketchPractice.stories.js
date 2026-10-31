import readme from './README.md?raw';
import css from './SketchPractice.css?raw';
import html from './SketchPractice.html?raw';
import { shadowFrame } from '../shadow-frame.js';

// A concept screen, not built yet. It renders in a shadow root so its own
// class names (.card, .status, .btn…) don't collide with garden.css.
export default {
  title: 'Sketches/SketchPractice',
  parameters: { layout: 'fullscreen', docs: { description: { component: readme } } },
};

export const Screens = { render: () => shadowFrame(css, html) };
