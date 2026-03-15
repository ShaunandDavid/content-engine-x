import { ReactNode } from "react";

export const FormCard = ({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <section className="panel-card">
    <div className="panel-card__header">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
    <div className="panel-card__body">{children}</div>
  </section>
);
