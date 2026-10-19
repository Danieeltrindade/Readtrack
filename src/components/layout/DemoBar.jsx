import { useState } from 'react';
import { FlaskConical, Home, RotateCcw, UserPlus } from 'lucide-react';
import { Button, ConfirmDialog } from '../ui';
import { useData } from '../../hooks/useData.js';
import { useToast } from '../../hooks/useToast.js';
import { PUBLIC_ROUTES } from '../../app/paths.js';

/**
 * Faixa fixa da demonstração pública: deixa claro que os dados são
 * fictícios e oferece restaurar, criar conta e voltar ao início.
 */
export function DemoBar() {
  const { actions } = useData();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  return (
    <aside className="demo-bar" aria-label="Modo demonstração">
      <p className="demo-bar__label">
        <FlaskConical size={16} aria-hidden="true" />
        <strong>Modo demonstração — dados fictícios</strong>
        <span className="demo-bar__detail">Explore e altere à vontade: nada é salvo em nenhuma conta.</span>
      </p>
      <div className="demo-bar__actions">
        <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setConfirming(true)}>
          Restaurar dados iniciais
        </Button>
        <Button size="sm" variant="secondary" icon={UserPlus} to={PUBLIC_ROUTES.register}>
          Criar minha conta
        </Button>
        <Button size="sm" variant="ghost" icon={Home} to={PUBLIC_ROUTES.home}>
          Página inicial
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title="Restaurar a demonstração?"
        description="Os livros, sessões, metas e conquistas fictícios voltam ao estado inicial, com datas de hoje. O que você alterou na demonstração será descartado. Nenhuma conta é afetada."
        confirmLabel="Restaurar"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          actions.resetDemo();
          setConfirming(false);
          toast.success('Demonstração restaurada.');
        }}
      />
    </aside>
  );
}
