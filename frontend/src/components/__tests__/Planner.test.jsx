import { render, screen } from '@testing-library/react';
import Planner from '../Planner';

const plan = ['Step One', 'Step Two', 'Step Three'];

test('renders all steps', () => {
  render(<Planner strategicPlan={plan} planStatus={{}} />);
  expect(screen.getByText('Step One')).toBeInTheDocument();
  expect(screen.getByText('Step Two')).toBeInTheDocument();
  expect(screen.getByText('Step Three')).toBeInTheDocument();
});

test('active step shows elapsed timer', () => {
  render(<Planner strategicPlan={plan} planStatus={{ 'Step One': 'active' }} />);
  expect(screen.getByText(/elapsed/i)).toBeInTheDocument();
});

test('completed step does not show elapsed timer', () => {
  render(<Planner strategicPlan={plan} planStatus={{ 'Step One': 'completed' }} />);
  expect(screen.queryByText(/elapsed/i)).not.toBeInTheDocument();
});
