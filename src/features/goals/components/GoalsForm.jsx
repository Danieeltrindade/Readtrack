import { useState } from 'react';
import { Save } from 'lucide-react';
import { Button, Field } from '../../../components/ui';
import { useData } from '../../../hooks/useData.js';
import { useToast } from '../../../hooks/useToast.js';
import { GOAL_LIMITS } from '../../../utils/goals.js';
import './GoalsForm.css';

/**
 * Configuração das metas. Cada meta pode ser desligada (fica "não configurada").
 * Usado na página de Metas e em Configurações — uma só implementação.
 */
export function GoalsForm({ onSaved, compact = false }) {
  const { goals, actions } = useData();
  const toast = useToast();
  const [values, setValues] = useState(() => ({
    dailyEnabled: goals.dailyMinutes !== null,
    dailyMinutes: String(goals.dailyMinutes ?? 30),
    weeklyEnabled: goals.weeklyPages !== null,
    weeklyPages: String(goals.weeklyPages ?? 150),
  }));
  const [errors, setErrors] = useState({});

  const set = (name) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setValues((v) => ({ ...v, [name]: value }));
  };

  const onSubmit = (event) => {
    event.preventDefault();
    const result = actions.updateGoals(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    toast.success('Metas salvas.');
    onSaved?.(result.goals);
  };

  return (
    <form className={`goals-form ${compact ? 'goals-form--compact' : ''}`} onSubmit={onSubmit} noValidate>
      <div className="goals-form__goal">
        <label className="check">
          <input type="checkbox" checked={values.dailyEnabled} onChange={set('dailyEnabled')} />
          <span>Meta diária de leitura</span>
        </label>
        {values.dailyEnabled && (
          <Field label="Minutos por dia" required error={errors.dailyMinutes} hint={`Entre ${GOAL_LIMITS.dailyMinutes.min} e ${GOAL_LIMITS.dailyMinutes.max}.`}>
            <input
              name="dailyMinutes"
              className="input input--number"
              inputMode="numeric"
              pattern="[0-9]*"
              value={values.dailyMinutes}
              onChange={set('dailyMinutes')}
            />
          </Field>
        )}
      </div>

      <div className="goals-form__goal">
        <label className="check">
          <input type="checkbox" checked={values.weeklyEnabled} onChange={set('weeklyEnabled')} />
          <span>Meta semanal de páginas</span>
        </label>
        {values.weeklyEnabled && (
          <Field label="Páginas por semana" required error={errors.weeklyPages} hint={`Entre ${GOAL_LIMITS.weeklyPages.min} e ${GOAL_LIMITS.weeklyPages.max.toLocaleString('pt-BR')}.`}>
            <input
              name="weeklyPages"
              className="input input--number"
              inputMode="numeric"
              pattern="[0-9]*"
              value={values.weeklyPages}
              onChange={set('weeklyPages')}
            />
          </Field>
        )}
      </div>

      <div className="goals-form__actions">
        <Button type="submit" icon={Save}>
          Salvar metas
        </Button>
      </div>
    </form>
  );
}
