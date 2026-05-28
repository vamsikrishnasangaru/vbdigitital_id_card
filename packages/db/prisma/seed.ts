import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding VB Digital ID Cards database...');

  // Create Super Admin
  const passwordHash = await bcrypt.hash('Admin@123', 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@vbdigital.com' },
    update: {},
    create: {
      email: 'admin@vbdigital.com',
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
    },
  });
  console.log('✅ Super Admin created:', superAdmin.email);

  // Create Demo School
  const school = await prisma.school.upsert({
    where: { code: 'DEMO001' },
    update: {},
    create: {
      name: 'Demo Public School',
      code: 'DEMO001',
      email: 'admin@demopublic.edu',
      phone: '9876543210',
      address: '123 Education Street',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560001',
    },
  });
  console.log('✅ Demo school created:', school.name);

  // Create School Admin
  const schoolAdmin = await prisma.user.upsert({
    where: { email: 'schooladmin@demopublic.edu' },
    update: {},
    create: {
      email: 'schooladmin@demopublic.edu',
      passwordHash,
      firstName: 'School',
      lastName: 'Admin',
      role: 'SCHOOL_ADMIN',
      schoolId: school.id,
    },
  });
  console.log('✅ School Admin created:', schoolAdmin.email);

  // Create Classes & Sections
  const classNames = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
  const sectionNames = ['A', 'B', 'C'];

  for (let i = 0; i < classNames.length; i++) {
    const cls = await prisma.class.upsert({
      where: { schoolId_name: { schoolId: school.id, name: classNames[i] } },
      update: {},
      create: { schoolId: school.id, name: classNames[i], sortOrder: i + 1 },
    });

    for (const secName of sectionNames) {
      await prisma.section.upsert({
        where: { classId_name: { classId: cls.id, name: secName } },
        update: {},
        create: { classId: cls.id, name: secName, sortOrder: sectionNames.indexOf(secName) },
      });
    }
  }
  console.log('✅ Classes & Sections created');

  // Create Teacher
  const teacher = await prisma.user.upsert({
    where: { email: 'teacher@demopublic.edu' },
    update: {},
    create: {
      email: 'teacher@demopublic.edu',
      passwordHash,
      firstName: 'Class',
      lastName: 'Teacher',
      role: 'TEACHER',
      schoolId: school.id,
    },
  });
  console.log('✅ Teacher created:', teacher.email);

  console.log('\n🎉 Seed completed! Login credentials:');
  console.log('   Super Admin: admin@vbdigital.com / Admin@123');
  console.log('   School Admin: schooladmin@demopublic.edu / Admin@123');
  console.log('   Teacher: teacher@demopublic.edu / Admin@123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
