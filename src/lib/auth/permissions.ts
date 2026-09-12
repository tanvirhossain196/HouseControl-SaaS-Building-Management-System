/**
 * Who may do what.
 *
 * One permission map is shared by UI, server actions and API.
 */

export const PERMISSIONS = [

  // Platform
  'platform.manage',
  'platform.audit.view',

  // Organization
  'org.manage',
  'org.billing.manage',
  'org.team.manage',
  'org.audit.view',

  // Property
  'building.create',
  'building.edit',
  'building.archive',

  'flat.create',
  'flat.edit',
  'flat.archive',
  'flat.assign_moderator',

  'landlord_rent.manage',

  // My Flat
  'my_flat.view',

  // People
  'resident.invite',
  'resident.remove',
  'rent.assign',
  'moderator.transfer',

  // Money
  'payment.submit',
  'payment.review',
  'due.manage',
  'expense.manage',

  // Gate
  'visitor.log',
  'visitor.preapprove',
  'visitor.block',

  // Repairs
  'maintenance.create',
  'maintenance.assign',
  'maintenance.resolve',

  // Reports
  'report.org.view',
  'report.flat.view',
  'report.self.view',

] as const


export type Permission = (typeof PERMISSIONS)[number]


export type RoleKey =
  | 'super_admin'
  | 'admin'
  | 'moderator'
  | 'resident'
  | 'guard'


/*
|--------------------------------------------------------------------------
| Resident
|--------------------------------------------------------------------------
*/

const RESIDENT: Permission[] = [

  'my_flat.view',

  'payment.submit',

  'maintenance.create',

  'visitor.preapprove',

  'report.self.view',

]


/*
|--------------------------------------------------------------------------
| Guard
|--------------------------------------------------------------------------
*/

const GUARD: Permission[] = [

  'visitor.log',

  'maintenance.create',

]


/*
|--------------------------------------------------------------------------
| Moderator
|--------------------------------------------------------------------------
*/

const MODERATOR: Permission[] = [

  ...RESIDENT,

  'resident.invite',

  'resident.remove',

  'rent.assign',

  'moderator.transfer',

  'payment.review',

  'due.manage',

  'expense.manage',

  'visitor.log',

  'visitor.preapprove',

  'maintenance.assign',

  'maintenance.resolve',

  'report.flat.view',

]


/*
|--------------------------------------------------------------------------
| Owner (admin)
|--------------------------------------------------------------------------
*/

const ADMIN: Permission[] = [

  ...MODERATOR,

  'org.manage',

  'org.billing.manage',

  'org.team.manage',

  'org.audit.view',

  'building.create',

  'building.edit',

  'building.archive',

  'flat.create',

  'flat.edit',

  'flat.archive',

  'flat.assign_moderator',

  'landlord_rent.manage',

  'visitor.block',

  'report.org.view',

]



export const rolePermissions: Record<RoleKey, readonly Permission[]> = {

  super_admin: [
    ...PERMISSIONS
  ],

  admin: ADMIN,

  moderator: MODERATOR,

  resident: RESIDENT,

  guard: GUARD,

}



export type PermissionScope = {

  orgId?: string

  flatId?: string

}



export type PermissionContext = {

  isSuperAdmin:boolean

  orgs:{
    orgId:string
    role:'admin'|'guard'
  }[]

  flats:{
    flatId:string
    role:'moderator'|'resident'
  }[]

}



function roleGrants(
  role:RoleKey,
  permission:Permission
){

  return rolePermissions[role].includes(permission)

}



export function can(
  context:PermissionContext,
  permission:Permission,
  scope:PermissionScope={}
):boolean{


  if(context.isSuperAdmin)

    return true



  const orgRoles = scope.orgId

    ? context.orgs.filter(
        o=>o.orgId===scope.orgId
      )

    : context.orgs



  const flatRoles = scope.flatId

    ? context.flats.filter(
        f=>f.flatId===scope.flatId
      )

    : context.flats



  for(const org of orgRoles){

    const role:RoleKey =
      org.role==='admin'
      ? 'admin'
      : 'guard'


    if(roleGrants(role,permission)){


      if(scope.flatId && !scope.orgId)

        continue


      return true

    }

  }



  for(const flat of flatRoles){


    if(
      roleGrants(
        flat.role,
        permission
      )
    )

      return true


  }



  return false

}



export function grantedPermissions(
 context:PermissionContext
):Permission[]{


 if(context.isSuperAdmin)

   return [...PERMISSIONS]



 const granted=new Set<Permission>()


 for(const org of context.orgs){


   const role:RoleKey =
    org.role==='admin'
    ? 'admin'
    : 'guard'


   rolePermissions[role]
   .forEach(
    p=>granted.add(p)
   )


 }



 for(const flat of context.flats){


   rolePermissions[flat.role]
   .forEach(
    p=>granted.add(p)
   )


 }



 return [...granted]

}



export function primaryRole(
 context:PermissionContext
):RoleKey{


 if(context.isSuperAdmin)

  return 'super_admin'


 if(
  context.orgs.some(
   o=>o.role==='admin'
  )
 )

  return 'admin'


 if(
  context.flats.some(
   f=>f.role==='moderator'
  )
 )

  return 'moderator'


 if(
  context.orgs.some(
   o=>o.role==='guard'
  )
 )

  return 'guard'


 return 'resident'

}



export const roleLabels:Record<RoleKey,string>={

 super_admin:'Super Admin',

 admin:'Owner',

 moderator:'Moderator',

 resident:'Tenant',

 guard:'Guard',

}



export const roleHome:Record<RoleKey,string>={


 super_admin:'/platform',

 admin:'/dashboard',

 moderator:'/dashboard',

 resident:'/dashboard',

 guard:'/gate',


}