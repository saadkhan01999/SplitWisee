import { useDispatch, useSelector } from "react-redux";
import { dialogClosed, selectDialog } from "../../app/uiSlice.js";
import { Modal } from "../../components/Modal.jsx";
import { Calculator } from "../calculator/Calculator.jsx";
import { ExpenseDetails } from "../expenses/ExpenseDetails.jsx";
import { ExpenseForm } from "../expenses/ExpenseForm.jsx";
import { ExpenseReviewForm } from "../expenses/ExpenseReviewForm.jsx";
import { InviteMemberForm } from "../household/InviteMemberForm.jsx";
import { NewHouseholdForm } from "../household/NewHouseholdForm.jsx";
import { InstallGuide } from "../install/InstallGuide.jsx";
import { ActivityPanel } from "../notifications/ActivityPanel.jsx";
import { SupportRequestForm } from "../settings/SupportRequestForm.jsx";
import { ClosingSheetView } from "../settlements/ClosingSheetView.jsx";
import { StartSettlement } from "../settlements/StartSettlement.jsx";
import { SectionsMenu } from "./SectionsMenu.jsx";
import { PaymentStatusForm } from "../settlements/PaymentStatusForm.jsx";

const DIALOGS = {
  "expense-new": { title: "Add an expense", component: ExpenseForm, wide: true },
  expense: { title: "Expense details", component: ExpenseDetails, wide: true },
  "expense-review": {
    title: ({ action }) =>
      ({
        reverse: "Reverse or refund",
        resolveExpense: "Resolve an issue",
        disputeExpense: "Report an issue",
      })[action],
    component: ExpenseReviewForm,
  },
  calculator: { title: "Calculator", component: Calculator },
  closing: { title: "Start new settlement", component: StartSettlement },
  "closing-sheet": { title: ({ name }) => name || "Closing sheet", component: ClosingSheetView, wide: true },
  sections: { title: "All sections", component: SectionsMenu },
  payment: {
    title: ({ status }) =>
      ({
        sent: "Confirm your transfer",
        received: "Confirm money received",
        disputed: "Report a payment issue",
      })[status],
    component: PaymentStatusForm,
  },
  activity: { title: "Household activity", component: ActivityPanel },
  invite: { title: "Invite a housemate", component: InviteMemberForm },
  "household-new": { title: "Create or join a household", component: NewHouseholdForm },
  install: { title: "CoinSplit on your phone", component: InstallGuide },
  support: { title: "Contact support", component: SupportRequestForm },
};

/** Renders the dialog named in ui.dialog. Dialog components receive their params plus `onClose`. */
export function DialogHost() {
  const dispatch = useDispatch();
  const dialog = useSelector(selectDialog);
  const config = dialog && DIALOGS[dialog.name];
  if (!config) return null;

  const close = () => dispatch(dialogClosed());
  const Content = config.component;
  const title = typeof config.title === "function" ? config.title(dialog.params) : config.title;

  return (
    <Modal title={title} onClose={close} wide={config.wide}>
      <Content {...dialog.params} onClose={close} />
    </Modal>
  );
}
