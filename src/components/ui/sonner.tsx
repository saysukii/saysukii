import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="bottom-left"
      offset={24}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "studio-toast",
          title: "studio-toast-title",
          description: "studio-toast-body",
          actionButton: "studio-toast-action",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
