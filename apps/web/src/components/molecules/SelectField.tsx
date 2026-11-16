import { useId, type ComponentProps } from 'react';
import { Label, Select } from '../atoms';

export interface SelectFieldProps extends Omit<ComponentProps<typeof Select>, 'id'> {
  label: string;
}

export function SelectField({ label, ...selectProps }: SelectFieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} {...selectProps} />
    </div>
  );
}
