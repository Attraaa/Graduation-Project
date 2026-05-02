import React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'outline';
  fullWidth?: boolean;
};

const Button = ({ children, variant = 'primary', fullWidth = false, className = '', ...props }: ButtonProps) => {
  let variantClass = '';
  
  switch (variant) {
    case 'primary':
      variantClass = 'btn-primary';
      break;
    case 'secondary':
      variantClass = 'btn-secondary';
      break;
    case 'danger':
      variantClass = 'btn-danger';
      break;
    case 'warning':
      variantClass = 'btn-warning';
      break;
    case 'outline':
      variantClass = 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50';
      break;
  }

  return (
    <button
      className={`btn-duo px-4 py-3 ${variantClass} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
