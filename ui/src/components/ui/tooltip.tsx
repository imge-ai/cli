import * as React from 'react';
import * as Primitive from '@radix-ui/react-tooltip';
import { cn } from '../../lib/utils.js';

export const Provider = Primitive.Provider;
export const Root = Primitive.Root;
export const Trigger = Primitive.Trigger;
export const Portal = Primitive.Portal;
export const Arrow = Primitive.Arrow;
export const Content = React.forwardRef<React.ElementRef<typeof Primitive.Content>,React.ComponentPropsWithoutRef<typeof Primitive.Content>>(({className,...props},ref)=><Primitive.Content ref={ref} className={cn(className)} {...props}/>);
Content.displayName = 'TooltipContent';
