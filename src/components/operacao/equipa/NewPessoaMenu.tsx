import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, UserCog, HardHat } from "lucide-react";
import { NewProducerDialog } from "./NewProducerDialog";
import { NewStaffDialog } from "@/components/operacao/NewStaffDialog";

interface Props {
  onCreated?: (profileId: string) => void;
}

export function NewPessoaMenu({ onCreated }: Props) {
  const [openProducer, setOpenProducer] = useState(false);
  const [openStaff, setOpenStaff] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" /> Nova pessoa
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setOpenProducer(true)}>
            <UserCog className="h-4 w-4 mr-2" /> Convidar produtor
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpenStaff(true)}>
            <HardHat className="h-4 w-4 mr-2" /> Cadastrar Staff de Campo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NewProducerDialog
        open={openProducer}
        onClose={() => setOpenProducer(false)}
        onCreated={onCreated}
      />
      <NewStaffDialog
        open={openStaff}
        onClose={() => setOpenStaff(false)}
        onCreated={onCreated}
      />
    </>
  );
}
