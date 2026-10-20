import { Cpu } from 'lucide-react';
import { CiListPage } from './list';

/** Endpoint-focused view of the CMDB: workstations, servers, mobile and network devices. */
export default function DevicesPage() {
  return <CiListPage title="Devices" subtitle="Workstations, servers, mobile and network devices" icon={<Cpu />} fixed={{ category: 'workstation,server,mobile,network' }} />;
}
