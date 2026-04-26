import Select, { type StylesConfig, type MultiValue } from 'react-select'
import type { Course } from '../types'

type Option = { value: string; label: string }

interface Props {
  courses: Course[]
  label: string
  placeholder: string
  value: string[]
  onChange: (ids: string[]) => void
}

const selectStyles: StylesConfig<Option, true> = {
  control: (base, state) => ({
    ...base,
    borderColor: state.isFocused ? '#d40511' : 'rgba(0, 43, 69, 0.2)',
    borderRadius: '8px',
    boxShadow: 'none',
    minHeight: '42px',
    '&:hover': { borderColor: '#d40511' },
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? '#d40511'
      : state.isFocused
        ? 'rgba(212, 5, 17, 0.08)'
        : 'white',
    color: state.isSelected ? 'white' : '#002b45',
    cursor: 'pointer',
  }),
  multiValue: base => ({
    ...base,
    backgroundColor: 'rgba(212, 5, 17, 0.1)',
    borderRadius: '6px',
  }),
  multiValueLabel: base => ({
    ...base,
    color: '#d40511',
    fontWeight: 600,
    fontSize: '0.82rem',
  }),
  multiValueRemove: base => ({
    ...base,
    color: '#d40511',
    ':hover': { backgroundColor: '#d40511', color: 'white' },
  }),
}

export function CourseSelector({ courses, label, placeholder, value, onChange }: Props) {
  const options: Option[] = courses
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    .map(c => ({ value: c.id, label: c.name }))

  const selected = options.filter(o => value.includes(o.value))

  function handleChange(opts: MultiValue<Option>) {
    onChange(opts.map(o => o.value))
  }

  return (
    <div className="selection-card">
      <h3>{label}</h3>
      <Select
        isMulti
        options={options}
        value={selected}
        onChange={handleChange}
        placeholder={placeholder}
        styles={selectStyles}
        noOptionsMessage={() => 'Keine Lehrgänge gefunden'}
      />
    </div>
  )
}
