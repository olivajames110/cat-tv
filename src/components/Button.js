import React from "react";

const Button = ({ children, onClick, className, sx }) => {
  const styles = {
    padding: "8px 14px",

    border: "2px solid rgba(255,255,255,0.3)",

    background: "rgba(255,255,255,0.1)",
    color: "white",
    borderRadius: "12px",
    cursor: "pointer",
    transition: "all 0.2s",
    font_size: "12px",
    backdrop_filter: "blur(4px)",
    ...sx,
  };
  return (
    <button className={className} onClick={onClick} style={styles}>
      {children}
    </button>
  );
};

export default Button;
