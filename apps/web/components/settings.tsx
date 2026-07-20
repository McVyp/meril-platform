"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useSession } from "@/context/SessionContext";
import { AccountSection } from "./settings-account";
import { SecuritySection } from "./settings-security";

export default function SettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { loaded, loggedIn } = useSession();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="flex h-[70vh] max-h-[640px] min-h-[460px] !w-[90vw] !max-w-4xl flex-col"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-[1.8rem]">Settings</DialogTitle>
        </DialogHeader>

        <Tabs
          defaultValue="account"
          orientation={isDesktop ? "vertical" : "horizontal"}
          className={
            isDesktop
              ? "flex-1 flex-row gap-6 overflow-hidden"
              : "flex-1 flex-col overflow-hidden"
          }
        >
          <TabsList
            className={
              isDesktop
                ? "h-fit w-40 flex-shrink-0 flex-col items-stretch gap-1 bg-transparent p-0"
                : ""
            }
          >
            <TabsTrigger
              value="account"
              className={isDesktop ? "justify-start text-[1.4rem] cursor-pointer" : ""}
            >
              Account
            </TabsTrigger>
            <TabsTrigger
              value="security"
              className={isDesktop ? "justify-start text-[1.4rem]" : ""}
            >
              Security
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="account">
              <AccountSection onClose={onClose} />
            </TabsContent>

            <TabsContent value="security">
              {!loaded ? (
                <p className="text-sm text-muted-foreground">Checking...</p>
              ) : loggedIn ? (
                <SecuritySection />
              ) : (
                <p className="text-sm text-muted-foreground">
                  You need to be logged in to manage security settings.
                </p>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
