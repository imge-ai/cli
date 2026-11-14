import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

const buttonVariants = cva('', { variants: { variant: { ghost:'', outline:'' }, size: { icon:'', default:'' } }, defaultVariants: { variant:'ghost', size:'default' } });
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => <button ref={ref} className={cn(buttonVariants({variant,size}),className)} {...props} />);
Button.displayName = 'Button';
