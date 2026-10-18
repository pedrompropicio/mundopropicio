import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import DataEntryDialog from '/src/components/data-entry/DataEntryDialog';
import StandaloneInvoiceScanner from '/src/pages/StandaloneInvoiceScanner';
import {AccountantStandaloneInvoicesTab} from '/src/pages/contabilidade/AccountantStandaloneInvoicesTab';
import '/src/index.css';
createRoot(document.getElementById('root') as HTMLElement).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><BrowserRouter><Routes><Route path='/entry' element={<DataEntryDialog open onOpenChange={()=>{}}/>}/><Route path='/scanner-faturas' element={<StandaloneInvoiceScanner/>}/><Route path='/edit' element={<AccountantStandaloneInvoicesTab/>}/></Routes><div id='local-toast' role='status'/></BrowserRouter></QueryClientProvider>);
