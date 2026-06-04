import '@testing-library/jest-dom';
import { configure } from '@testing-library/dom';

// Exclude aria-hidden elements from text queries so filter buttons are
// unambiguous when trace badges share the same label text (e.g. "SYS", "ERR").
configure({ defaultIgnore: 'script, style, [aria-hidden="true"]' });
