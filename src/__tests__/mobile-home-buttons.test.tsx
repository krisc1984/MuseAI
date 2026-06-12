import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import MobileHome from '../pages/MobileHome';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
}

describe('MobileHome navigation buttons', () => {
  it('renders native entry buttons and preserves navigation', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={(
              <>
                <MobileHome />
                <LocationProbe />
              </>
            )}
          />
          <Route path="/chat" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    const chatEntry = screen.getByRole('button', { name: /伴侣聊天/ });
    expect(chatEntry.tagName).toBe('BUTTON');
    expect(chatEntry).toHaveAttribute('type', 'button');

    chatEntry.focus();
    expect(chatEntry).toHaveFocus();

    fireEvent.click(chatEntry);
    expect(screen.getByTestId('current-path')).toHaveTextContent('/chat');
  });
});
