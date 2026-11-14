import * as React from 'react';
import * as Primitive from '@radix-ui/react-toggle-group';
import { cn } from '../../lib/utils.js';

export const Root = Primitive.Root;
export const Item = React.forwardRef<React.ElementRef<typeof Primitive.Item>, React.ComponentPropsWithoutRef<typeof Primitive.Item>>(({className,...props},ref)=><Primitive.Item ref={ref} className={cn(className)} {...props}/>);
Item.displayName = 'ToggleGroupItem';
