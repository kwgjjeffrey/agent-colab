import {
  Children,
  Fragment,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

type Action = { primary: boolean; node: ReactNode };
type ActionContext = {
  actions: Record<string, Action>;
  register: (id: string, action?: Action) => void;
};
const Context = createContext<ActionContext | null>(null);

/** Render registered actions at their destination so items inherit the real Base UI menu context.
 * DOM portals retain the source context and cannot safely compose menu items. */
export function WorkspaceActionProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<Record<string, Action>>({});
  const register = useCallback(
    (id: string, action?: Action) =>
      setActions((current) => {
        const next = { ...current };
        if (action) next[id] = action;
        else delete next[id];
        return next;
      }),
    [],
  );
  const value = useMemo(() => ({ actions, register }), [actions, register]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function WorkspaceActions({
  children,
  primary = false,
}: {
  children: ReactNode;
  primary?: boolean;
}) {
  const context = useContext(Context),
    id = useId(),
    register = context?.register;
  useEffect(() => {
    if (!register) return;
    register(id, { primary, node: children });
    return () => register(id);
  }, [register, id, primary, children]);
  return context ? null : (
    <div className="flex justify-end gap-2">{children}</div>
  );
}
function menuActions(node: ReactNode): ReactNode {
  return Children.map(node, (child) => {
    if (!isValidElement<Record<string, unknown>>(child)) return child;
    if (child.type === Fragment)
      return menuActions(child.props.children as ReactNode);
    if (child.type !== Button) return child;
    return (
      <DropdownMenuItem
        disabled={Boolean(child.props.disabled)}
        closeOnClick={false}
        onClick={child.props.onClick as (() => void) | undefined}
        data-trace-target={
          child.props["data-trace-target"] as string | undefined
        }
      >
        {child.props.children as ReactNode}
      </DropdownMenuItem>
    );
  });
}
export function WorkspaceActionSlot({
  primary = false,
}: {
  primary?: boolean;
}) {
  const context = useContext(Context);
  return (
    <>
      {Object.entries(context?.actions ?? {})
        .filter(([, action]) => action.primary === primary)
        .map(([id, action]) => (
          <Fragment key={id}>
            {primary ? action.node : menuActions(action.node)}
          </Fragment>
        ))}
    </>
  );
}
