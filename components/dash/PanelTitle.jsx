// The panel heading every widget uses: icon badge, name, Yoru's Japanese
// subtitle when the theme's flair asks for it, then actions on the right.
// A heading is the name and its icon only: counts and explanations go in a
// title attribute or nowhere .
import { IconBadge } from './icons.js';

export default function PanelTitle({ icon, title, jp, flair, children, as: Tag = 'h2' }) {
  return <Tag>
    {icon && <IconBadge name={icon} />}
    {title}
    {flair?.jp && jp && <em className="jp" lang="ja">{jp}</em>}
    {children && <div className="act">{children}</div>}
  </Tag>;
}
