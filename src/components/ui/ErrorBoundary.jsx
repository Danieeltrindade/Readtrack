import { Component } from 'react';
import { ErrorState } from './States.jsx';

/**
 * Captura erros de renderização de uma área da tela, para que um bug em
 * uma página não derrube o site inteiro. `resetKey` (ex.: a rota atual)
 * limpa o erro quando o usuário navega para outro lugar.
 */
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Erro capturado pelo ErrorBoundary:', error, info.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorState
          titleAs="h1"
          title="Esta página não pôde ser exibida"
          description="Seus dados continuam salvos. Tente recarregar a página ou volte ao início."
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
