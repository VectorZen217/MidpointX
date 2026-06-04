import { render, screen, fireEvent } from '@testing-library/react';
import ActivityFeed from '../ActivityFeed';

const trace = [
  { type: 'system',     message: 'MidpointX initialized',  time: '10:00:00' },
  { type: 'reflection', message: 'Analyzing user intent',  time: '10:00:01' },
  { type: 'error',      message: 'Connection timed out',   time: '10:00:02' },
];
const tokenUsage = { input: 500, output: 200 };

test('renders all trace items by default', () => {
  render(<ActivityFeed trace={trace} tokenUsage={tokenUsage} />);
  expect(screen.getByText('MidpointX initialized')).toBeInTheDocument();
  expect(screen.getByText('Analyzing user intent')).toBeInTheDocument();
  expect(screen.getByText('Connection timed out')).toBeInTheDocument();
});

test('SYS filter shows only system entries', () => {
  render(<ActivityFeed trace={trace} tokenUsage={tokenUsage} />);
  fireEvent.click(screen.getByText('SYS'));
  expect(screen.getByText('MidpointX initialized')).toBeInTheDocument();
  expect(screen.queryByText('Analyzing user intent')).not.toBeInTheDocument();
  expect(screen.queryByText('Connection timed out')).not.toBeInTheDocument();
});

test('ERR filter shows only error entries', () => {
  render(<ActivityFeed trace={trace} tokenUsage={tokenUsage} />);
  fireEvent.click(screen.getByText('ERR'));
  expect(screen.getByText('Connection timed out')).toBeInTheDocument();
  expect(screen.queryByText('MidpointX initialized')).not.toBeInTheDocument();
});

test('search filters by message content', () => {
  render(<ActivityFeed trace={trace} tokenUsage={tokenUsage} />);
  fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'timed' } });
  expect(screen.getByText('Connection timed out')).toBeInTheDocument();
  expect(screen.queryByText('MidpointX initialized')).not.toBeInTheDocument();
});

test('shows token counts in footer', () => {
  render(<ActivityFeed trace={trace} tokenUsage={tokenUsage} />);
  expect(screen.getByText('500')).toBeInTheDocument();
  expect(screen.getByText('200')).toBeInTheDocument();
});

test('long messages get truncated with show-more button', () => {
  const longTrace = [{ type: 'system', message: 'A'.repeat(150), time: '10:00:00' }];
  render(<ActivityFeed trace={longTrace} tokenUsage={tokenUsage} />);
  expect(screen.getByText('show more')).toBeInTheDocument();
  fireEvent.click(screen.getByText('show more'));
  expect(screen.getByText('show less')).toBeInTheDocument();
});
