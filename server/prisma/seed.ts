import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('muditgoyal', 10);

  const adminStaff = await prisma.staff.upsert({
    where: { email: 'mudit.goyal@mgsg.in' },
    update: {},
    create: {
      staffName: 'Mudit Goyal',
      isPartner: true,
      perHourCost: 0,
      email: 'mudit.goyal@mgsg.in',
    },
  });

  await prisma.user.upsert({
    where: { email: 'mudit.goyal@mgsg.in' },
    update: {},
    create: {
      email: 'mudit.goyal@mgsg.in',
      password: hashedPassword,
      role: 'ADMIN',
      staffId: adminStaff.id,
    },
  });

  console.log('Seed complete: admin user created');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
